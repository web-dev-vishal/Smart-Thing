// DM controller — thin HTTP layer over dm.service.js

import * as dmService from "../services/dm.service.js";

const handleError = (res, err) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message });

export const startDM = async (req, res) => {
    try {
        const { participantIds } = req.body;
        const dm = await dmService.getOrCreateDM(req.params.workspaceId, req.userId, participantIds || []);
        res.status(201).json({ success: true, dm });
    } catch (err) { handleError(res, err); }
};

export const list = async (req, res) => {
    try {
        const dms = await dmService.listDMs(req.params.workspaceId, req.userId);
        res.json({ success: true, dms });
    } catch (err) { handleError(res, err); }
};

export const get = async (req, res) => {
    try {
        const dm = await dmService.getDM(req.params.workspaceId, req.params.dmId, req.userId);
        res.json({ success: true, dm });
    } catch (err) { handleError(res, err); }
};

export const sendMessage = async (req, res) => {
    try {
        const message = await dmService.sendDMMessage(
            req.params.workspaceId, req.params.dmId, req.userId, req.body
        );
        res.status(201).json({ success: true, message });
    } catch (err) { handleError(res, err); }
};

export const getMessages = async (req, res) => {
    try {
        const messages = await dmService.getDMMessages(
            req.params.workspaceId, req.params.dmId, req.userId, req.query
        );
        res.json({ success: true, messages });
    } catch (err) { handleError(res, err); }
};

export const close = async (req, res) => {
    try {
        await dmService.closeDM(req.params.workspaceId, req.params.dmId, req.userId);
        res.json({ success: true, message: "DM closed" });
    } catch (err) { handleError(res, err); }
};

export const getMembers = async (req, res) => {
    try {
        const members = await dmService.getDMMembers(req.params.workspaceId, req.params.dmId, req.userId);
        res.json({ success: true, members });
    } catch (err) { handleError(res, err); }
};
