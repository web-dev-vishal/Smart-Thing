// Workflow controller — thin HTTP layer over workflow.service.js

import * as workflowService from "../services/workflow.service.js";

const handleError = (res, err) =>
    res.status(err.statusCode || 500).json({ success: false, message: err.message });

export const create = async (req, res) => {
    try {
        const workflow = await workflowService.createWorkflow(
            req.params.workspaceId, req.userId, req.body
        );
        res.status(201).json({ success: true, workflow });
    } catch (err) { handleError(res, err); }
};

export const list = async (req, res) => {
    try {
        const result = await workflowService.listWorkflows(
            req.params.workspaceId, req.userId, req.query
        );
        res.json({ success: true, ...result });
    } catch (err) { handleError(res, err); }
};

export const get = async (req, res) => {
    try {
        const workflow = await workflowService.getWorkflow(
            req.params.workspaceId, req.params.workflowId, req.userId
        );
        res.json({ success: true, workflow });
    } catch (err) { handleError(res, err); }
};

export const update = async (req, res) => {
    try {
        const workflow = await workflowService.updateWorkflow(
            req.params.workspaceId, req.params.workflowId, req.userId, req.body
        );
        res.json({ success: true, workflow });
    } catch (err) { handleError(res, err); }
};

export const remove = async (req, res) => {
    try {
        await workflowService.deleteWorkflow(
            req.params.workspaceId, req.params.workflowId, req.userId
        );
        res.json({ success: true, message: "Workflow deleted" });
    } catch (err) { handleError(res, err); }
};

export const enable = async (req, res) => {
    try {
        const workflow = await workflowService.setWorkflowEnabled(
            req.params.workspaceId, req.params.workflowId, req.userId, true
        );
        res.json({ success: true, workflow });
    } catch (err) { handleError(res, err); }
};

export const disable = async (req, res) => {
    try {
        const workflow = await workflowService.setWorkflowEnabled(
            req.params.workspaceId, req.params.workflowId, req.userId, false
        );
        res.json({ success: true, workflow });
    } catch (err) { handleError(res, err); }
};

export const trigger = async (req, res) => {
    try {
        const execution = await workflowService.triggerWorkflow(
            req.params.workspaceId, req.params.workflowId, req.userId,
            req.body, req.messagePublisher
        );
        res.status(202).json({ success: true, execution });
    } catch (err) { handleError(res, err); }
};

export const getExecutions = async (req, res) => {
    try {
        const result = await workflowService.getExecutions(
            req.params.workspaceId, req.params.workflowId, req.userId, req.query
        );
        res.json({ success: true, ...result });
    } catch (err) { handleError(res, err); }
};

export const getExecution = async (req, res) => {
    try {
        const execution = await workflowService.getExecution(
            req.params.workspaceId, req.params.executionId, req.userId
        );
        res.json({ success: true, execution });
    } catch (err) { handleError(res, err); }
};

export const retryExecution = async (req, res) => {
    try {
        const execution = await workflowService.retryExecution(
            req.params.workspaceId, req.params.executionId, req.userId, req.messagePublisher
        );
        res.json({ success: true, execution });
    } catch (err) { handleError(res, err); }
};
