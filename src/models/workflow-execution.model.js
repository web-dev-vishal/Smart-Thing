// WorkflowExecution — a single run of a workflow.
// Created when a workflow is triggered, updated as each node executes.
// Gives full visibility into what happened, what each node returned,
// and where it failed if something went wrong.

import mongoose from "mongoose";

const nodeResultSchema = new mongoose.Schema(
    {
        nodeId:     { type: String, required: true },
        nodeName:   { type: String },
        nodeType:   { type: String },
        status:     { type: String, enum: ["pending", "running", "success", "failed", "skipped"] },
        startedAt:  { type: Date },
        finishedAt: { type: Date },
        durationMs: { type: Number },
        // What the node produced — stored as mixed so any shape is fine
        output:     { type: mongoose.Schema.Types.Mixed },
        error:      { type: String },
    },
    { _id: false }
);

const workflowExecutionSchema = new mongoose.Schema(
    {
        workflowId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Workflow",
            required: true,
            index:    true,
        },
        workspaceId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Workspace",
            required: true,
            index:    true,
        },
        // What triggered this execution
        triggeredBy: {
            type:   String,
            enum:   ["message_keyword", "schedule", "webhook", "manual", "api"],
            required: true,
        },
        // The trigger payload — e.g. the message that matched a keyword
        triggerPayload: {
            type: mongoose.Schema.Types.Mixed,
        },
        status: {
            type:    String,
            enum:    ["queued", "running", "success", "failed", "cancelled"],
            default: "queued",
            index:   true,
        },
        nodeResults: [nodeResultSchema],
        startedAt:   { type: Date },
        finishedAt:  { type: Date },
        durationMs:  { type: Number },
        // Error message if the whole execution failed
        error:       { type: String },
        // Retry tracking
        retryCount:  { type: Number, default: 0 },
        maxRetries:  { type: Number, default: 2 },
    },
    {
        timestamps: true,
    }
);

workflowExecutionSchema.index({ workflowId: 1, createdAt: -1 });
workflowExecutionSchema.index({ workspaceId: 1, status: 1 });

const WorkflowExecution = mongoose.model("WorkflowExecution", workflowExecutionSchema);
export default WorkflowExecution;
