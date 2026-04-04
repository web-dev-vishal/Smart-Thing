// Message controller — thin HTTP layer over message.service.js

import * as messageService from "../services/message.service.js";

const handleError = (res, err) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message });

export const send = async (req, res) => {
    try {
        const message = await messageService.sendMessage(
            req.params.workspaceId, req.params.channelId, req.userId, req.body
        );
        res.status(201).json({ success: true, message });
    } catch (err) { handleError(res, err); }
};

export const list = async (req, res) => {
    try {
        const messages = await messageService.getMessages(
            req.params.workspaceId, req.params.channelId, req.userId, req.query
        );
        res.json({ success: true, messages });
    } catch (err) { handleError(res, err); }
};

export const get = async (req, res) => {
    try {
        // Single message — just return it from the list with a limit of 1
        const messages = await messageService.getMessages(
            req.params.workspaceId, req.params.channelId, req.userId, { limit: 1 }
        );
        const msg = messages.find(m => m._id.toString() === req.params.messageId);
        if (!msg) return res.status(404).json({ success: false, message: "Message not found" });
        res.json({ success: true, message: msg });
    } catch (err) { handleError(res, err); }
};

export const edit = async (req, res) => {
    try {
        const message = await messageService.editMessage(
            req.params.workspaceId, req.params.channelId,
            req.params.messageId, req.userId, req.body.content
        );
        res.json({ success: true, message });
    } catch (err) { handleError(res, err); }
};

export const remove = async (req, res) => {
    try {
        await messageService.deleteMessage(
            req.params.workspaceId, req.params.channelId, req.params.messageId, req.userId
        );
        res.json({ success: true, message: "Message deleted" });
    } catch (err) { handleError(res, err); }
};

export const react = async (req, res) => {
    try {
        const reactions = await messageService.addReaction(
            req.params.workspaceId, req.params.channelId,
            req.params.messageId, req.userId, req.body.emoji
        );
        res.json({ success: true, reactions });
    } catch (err) { handleError(res, err); }
};

export const unreact = async (req, res) => {
    try {
        const reactions = await messageService.removeReaction(
            req.params.workspaceId, req.params.channelId,
            req.params.messageId, req.userId, req.body.emoji
        );
        res.json({ success: true, reactions });
    } catch (err) { handleError(res, err); }
};

export const getThread = async (req, res) => {
    try {
        const thread = await messageService.getThread(
            req.params.workspaceId, req.params.channelId, req.params.messageId, req.userId
        );
        res.json({ success: true, ...thread });
    } catch (err) { handleError(res, err); }
};

export const replyInThread = async (req, res) => {
    try {
        const message = await messageService.sendMessage(
            req.params.workspaceId, req.params.channelId, req.userId,
            { ...req.body, parentId: req.params.messageId }
        );
        res.status(201).json({ success: true, message });
    } catch (err) { handleError(res, err); }
};

export const bookmark = async (req, res) => {
    try {
        await messageService.bookmarkMessage(req.params.workspaceId, req.params.messageId, req.userId);
        res.json({ success: true, message: "Bookmarked" });
    } catch (err) { handleError(res, err); }
};

export const unbookmark = async (req, res) => {
    try {
        await messageService.removeBookmark(req.params.workspaceId, req.params.messageId, req.userId);
        res.json({ success: true, message: "Bookmark removed" });
    } catch (err) { handleError(res, err); }
};

export const getBookmarks = async (req, res) => {
    try {
        const messages = await messageService.getBookmarks(req.params.workspaceId, req.userId, req.query);
        res.json({ success: true, messages });
    } catch (err) { handleError(res, err); }
};

export const searchWorkspace = async (req, res) => {
    try {
        const results = await messageService.searchWorkspace(
            req.params.workspaceId, req.userId, req.query.q, { limit: req.query.limit }
        );
        res.json({ success: true, results });
    } catch (err) { handleError(res, err); }
};
