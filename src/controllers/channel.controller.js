// Channel controller — thin HTTP layer over channel.service.js

import * as channelService from "../services/channel.service.js";

const handleError = (res, err) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message });

export const create = async (req, res) => {
    try {
        const channel = await channelService.createChannel(req.params.workspaceId, req.userId, req.body);
        res.status(201).json({ success: true, channel });
    } catch (err) { handleError(res, err); }
};

export const list = async (req, res) => {
    try {
        const channels = await channelService.listChannels(req.params.workspaceId, req.userId);
        res.json({ success: true, channels });
    } catch (err) { handleError(res, err); }
};

export const get = async (req, res) => {
    try {
        const channel = await channelService.getChannel(
            req.params.workspaceId, req.params.channelId, req.userId
        );
        res.json({ success: true, channel });
    } catch (err) { handleError(res, err); }
};

export const update = async (req, res) => {
    try {
        const channel = await channelService.updateChannel(
            req.params.workspaceId, req.params.channelId, req.userId, req.body
        );
        res.json({ success: true, channel });
    } catch (err) { handleError(res, err); }
};

export const remove = async (req, res) => {
    try {
        await channelService.deleteChannel(
            req.params.workspaceId, req.params.channelId, req.userId
        );
        res.json({ success: true, message: "Channel archived" });
    } catch (err) { handleError(res, err); }
};

export const join = async (req, res) => {
    try {
        const channel = await channelService.joinChannel(
            req.params.workspaceId, req.params.channelId, req.userId
        );
        res.json({ success: true, channel });
    } catch (err) { handleError(res, err); }
};

export const leave = async (req, res) => {
    try {
        await channelService.leaveChannel(
            req.params.workspaceId, req.params.channelId, req.userId
        );
        res.json({ success: true, message: "Left channel" });
    } catch (err) { handleError(res, err); }
};

export const pin = async (req, res) => {
    try {
        const pins = await channelService.pinMessage(
            req.params.workspaceId, req.params.channelId, req.params.messageId, req.userId
        );
        res.json({ success: true, pins });
    } catch (err) { handleError(res, err); }
};

export const unpin = async (req, res) => {
    try {
        await channelService.unpinMessage(
            req.params.workspaceId, req.params.channelId, req.params.messageId, req.userId
        );
        res.json({ success: true, message: "Message unpinned" });
    } catch (err) { handleError(res, err); }
};

export const search = async (req, res) => {
    try {
        const results = await channelService.searchMessages(
            req.params.workspaceId, req.params.channelId, req.userId,
            req.query.q, { limit: req.query.limit }
        );
        res.json({ success: true, results });
    } catch (err) { handleError(res, err); }
};
