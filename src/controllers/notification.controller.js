// Notification controller — thin HTTP layer over nexus-notification.service.js

import * as notifService from "../services/nexus-notification.service.js";

const handleError = (res, err) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message });

export const list = async (req, res) => {
    try {
        const result = await notifService.getNotifications(req.userId, {
            page:       req.query.page,
            limit:      req.query.limit,
            unreadOnly: req.query.unread === "true",
        });
        res.json({ success: true, ...result });
    } catch (err) { handleError(res, err); }
};

export const markRead = async (req, res) => {
    try {
        // Body can have { ids: [...] } to mark specific ones, or empty to mark all
        await notifService.markAsRead(req.userId, req.body.ids);
        res.json({ success: true, message: "Notifications marked as read" });
    } catch (err) { handleError(res, err); }
};

export const remove = async (req, res) => {
    try {
        await notifService.deleteNotification(req.userId, req.params.id);
        res.json({ success: true, message: "Notification deleted" });
    } catch (err) { handleError(res, err); }
};

export const getPreferences = async (req, res) => {
    try {
        const prefs = await notifService.getPreferences(req.userId, req.params.workspaceId);
        res.json({ success: true, preferences: prefs });
    } catch (err) { handleError(res, err); }
};

export const updatePreferences = async (req, res) => {
    try {
        const prefs = await notifService.updatePreferences(req.userId, req.params.workspaceId, req.body);
        res.json({ success: true, preferences: prefs });
    } catch (err) { handleError(res, err); }
};
