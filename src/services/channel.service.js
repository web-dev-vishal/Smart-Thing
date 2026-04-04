// Channel service — create, manage, and query channels within a workspace.

import Channel from "../models/channel.model.js";
import Message from "../models/message.model.js";
import { assertMember, assertRole } from "./workspace.service.js";
import logger from "../utils/logger.js";

const createError = (statusCode, message) => {
    const err = new Error(message);
    err.statusCode = statusCode;
    return err;
};

// ── Create channel ────────────────────────────────────────────────────────────
export async function createChannel(workspaceId, userId, { name, description, type }) {
    await assertMember(workspaceId, userId);

    // Only admins/owners can create private channels
    if (type === "private") {
        await assertRole(workspaceId, userId, ["owner", "admin", "member"]);
    }

    const existing = await Channel.findOne({ workspaceId, name: name.toLowerCase() });
    if (existing) throw createError(409, `A channel named #${name} already exists`);

    const channel = await Channel.create({
        workspaceId,
        name:        name.toLowerCase(),
        description: description || "",
        type:        type || "public",
        createdBy:   userId,
        members:     [userId],
    });

    logger.info("Channel created", { workspaceId, channelId: channel._id, name });
    return channel;
}

// ── List channels ─────────────────────────────────────────────────────────────
export async function listChannels(workspaceId, userId) {
    await assertMember(workspaceId, userId);

    // Return public channels + private channels the user is a member of
    const channels = await Channel.find({
        workspaceId,
        isArchived: false,
        $or: [
            { type: "public" },
            { type: "private", members: userId },
        ],
    })
        .sort({ isDefault: -1, name: 1 })
        .lean();

    return channels;
}

// ── Get single channel ────────────────────────────────────────────────────────
export async function getChannel(workspaceId, channelId, userId) {
    await assertMember(workspaceId, userId);

    const channel = await Channel.findOne({ _id: channelId, workspaceId }).lean();
    if (!channel) throw createError(404, "Channel not found");

    // Private channel — only members can see it
    if (channel.type === "private") {
        const isMember = channel.members.some(m => m.toString() === userId.toString());
        if (!isMember) throw createError(403, "You are not a member of this private channel");
    }

    return channel;
}

// ── Update channel ────────────────────────────────────────────────────────────
export async function updateChannel(workspaceId, channelId, userId, updates) {
    const channel = await getChannel(workspaceId, channelId, userId);
    await assertRole(workspaceId, userId, ["owner", "admin"]);

    if (channel.isDefault && updates.name) {
        throw createError(400, "Cannot rename a default channel");
    }

    const allowed = ["name", "description", "topic"];
    const filtered = Object.fromEntries(
        Object.entries(updates).filter(([k]) => allowed.includes(k))
    );

    if (filtered.name) {
        const existing = await Channel.findOne({
            workspaceId,
            name: filtered.name.toLowerCase(),
            _id:  { $ne: channelId },
        });
        if (existing) throw createError(409, `A channel named #${filtered.name} already exists`);
        filtered.name = filtered.name.toLowerCase();
    }

    return Channel.findByIdAndUpdate(channelId, { $set: filtered }, { new: true });
}

// ── Delete channel ────────────────────────────────────────────────────────────
export async function deleteChannel(workspaceId, channelId, userId) {
    const channel = await getChannel(workspaceId, channelId, userId);
    await assertRole(workspaceId, userId, ["owner", "admin"]);

    if (channel.isDefault) throw createError(400, "Cannot delete a default channel");

    await Channel.findByIdAndUpdate(channelId, { isArchived: true });
    logger.info("Channel archived", { workspaceId, channelId });
}

// ── Join channel ──────────────────────────────────────────────────────────────
export async function joinChannel(workspaceId, channelId, userId) {
    await assertMember(workspaceId, userId);

    const channel = await Channel.findOne({ _id: channelId, workspaceId });
    if (!channel) throw createError(404, "Channel not found");
    if (channel.type === "private") throw createError(403, "Cannot join a private channel — you need an invite");

    const alreadyMember = channel.members.some(m => m.toString() === userId.toString());
    if (alreadyMember) return channel;

    channel.members.push(userId);
    await channel.save();
    return channel;
}

// ── Leave channel ─────────────────────────────────────────────────────────────
export async function leaveChannel(workspaceId, channelId, userId) {
    const channel = await Channel.findOne({ _id: channelId, workspaceId });
    if (!channel) throw createError(404, "Channel not found");
    if (channel.isDefault) throw createError(400, "Cannot leave a default channel");

    channel.members = channel.members.filter(m => m.toString() !== userId.toString());
    await channel.save();
}

// ── Pin message ───────────────────────────────────────────────────────────────
export async function pinMessage(workspaceId, channelId, messageId, userId) {
    await assertMember(workspaceId, userId);

    const channel = await Channel.findOne({ _id: channelId, workspaceId });
    if (!channel) throw createError(404, "Channel not found");

    const alreadyPinned = channel.pinnedMessages.some(
        p => p.messageId.toString() === messageId.toString()
    );
    if (alreadyPinned) throw createError(409, "Message is already pinned");
    if (channel.pinnedMessages.length >= 10) throw createError(400, "Cannot pin more than 10 messages");

    channel.pinnedMessages.push({ messageId, pinnedBy: userId });
    await channel.save();
    return channel.pinnedMessages;
}

// ── Unpin message ─────────────────────────────────────────────────────────────
export async function unpinMessage(workspaceId, channelId, messageId, userId) {
    await assertMember(workspaceId, userId);

    const channel = await Channel.findOne({ _id: channelId, workspaceId });
    if (!channel) throw createError(404, "Channel not found");

    channel.pinnedMessages = channel.pinnedMessages.filter(
        p => p.messageId.toString() !== messageId.toString()
    );
    await channel.save();
}

// ── Search messages in channel ────────────────────────────────────────────────
export async function searchMessages(workspaceId, channelId, userId, query, { limit = 20 } = {}) {
    await getChannel(workspaceId, channelId, userId);

    const results = await Message.find({
        channelId,
        isDeleted: false,
        $text: { $search: query },
    })
        .sort({ score: { $meta: "textScore" } })
        .limit(Math.min(limit, 50))
        .populate("senderId", "username")
        .lean();

    return results;
}
