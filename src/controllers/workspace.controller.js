// Workspace controller — thin HTTP layer over workspace.service.js
// Each method: validate input → call service → format response.

import * as workspaceService from "../services/workspace.service.js";

const handleError = (res, err) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message });

export const create = async (req, res) => {
    try {
        const workspace = await workspaceService.createWorkspace(req.userId, req.body);
        res.status(201).json({ success: true, workspace });
    } catch (err) { handleError(res, err); }
};

export const list = async (req, res) => {
    try {
        const workspaces = await workspaceService.getUserWorkspaces(req.userId);
        res.json({ success: true, workspaces });
    } catch (err) { handleError(res, err); }
};

export const get = async (req, res) => {
    try {
        const workspace = await workspaceService.getWorkspace(req.params.id);
        res.json({ success: true, workspace });
    } catch (err) { handleError(res, err); }
};

export const update = async (req, res) => {
    try {
        const workspace = await workspaceService.updateWorkspace(req.params.id, req.userId, req.body);
        res.json({ success: true, workspace });
    } catch (err) { handleError(res, err); }
};

export const remove = async (req, res) => {
    try {
        await workspaceService.deleteWorkspace(req.params.id, req.userId);
        res.json({ success: true, message: "Workspace deleted" });
    } catch (err) { handleError(res, err); }
};

export const invite = async (req, res) => {
    try {
        const { email, role } = req.body;
        const result = await workspaceService.inviteMember(req.params.id, req.userId, email, role);
        res.status(201).json({ success: true, member: result });
    } catch (err) { handleError(res, err); }
};

export const getMembers = async (req, res) => {
    try {
        const { page, limit } = req.query;
        const result = await workspaceService.getMembers(req.params.id, { page, limit });
        res.json({ success: true, ...result });
    } catch (err) { handleError(res, err); }
};

export const changeRole = async (req, res) => {
    try {
        const member = await workspaceService.changeMemberRole(
            req.params.id, req.userId, req.params.userId, req.body.role
        );
        res.json({ success: true, member });
    } catch (err) { handleError(res, err); }
};

export const removeMember = async (req, res) => {
    try {
        await workspaceService.removeMember(req.params.id, req.userId, req.params.userId);
        res.json({ success: true, message: "Member removed" });
    } catch (err) { handleError(res, err); }
};

export const stats = async (req, res) => {
    try {
        const data = await workspaceService.getWorkspaceStats(req.params.id);
        res.json({ success: true, stats: data });
    } catch (err) { handleError(res, err); }
};
