/**
 * Codemod: add ECS event.kind/category/type/action to GCP/Azure log generators.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

function resolveTypeExpr(outcomeExpr, cfg) {
  const t = outcomeExpr.trim();
  if (t.includes("isErr")) return `isErr ? ${cfg.typeErr} : ${cfg.typeOk}`;
  if (t === '"failure"' || t === "'failure'") return cfg.typeErr;
  if (t === '"success"' || t === "'success'") return cfg.typeOk;
  return `(${t} === "failure" ? ${cfg.typeErr} : ${cfg.typeOk})`;
}

function azureEventFields(cfg, outcomeExpr, actionExpr) {
  const kind = cfg.kind ?? '"event"';
  const typeExpr = resolveTypeExpr(outcomeExpr, cfg);
  return `{
      kind: ${kind},
      category: ${cfg.category},
      type: ${typeExpr},
      action: String(${actionExpr}),
      outcome: ${outcomeExpr.trim()},
      duration: `;
}

function patchAzureSingleLine(content, cfg) {
  const actionDefault = cfg.actionExpr ?? "operationName";
  return content.replace(
    /event: \{ outcome: ([^,]+), duration: (randInt\([^)]*\))(?:, action: ([^}]+))?\s*\}/g,
    (match, outcome, duration, existingAction) => {
      if (match.includes("kind:")) return match;
      const action = existingAction?.trim() || actionDefault;
      const fields = azureEventFields(cfg, outcome, action);
      return `event: ${fields}${duration},\n    }`;
    }
  );
}

function patchGcpMultilineEvent(content, cfg, actionExpr = '"activity"') {
  const kind = cfg.kind ?? '"event"';
  return content.replace(
    /event: \{\n\s*outcome(?:: ([^,\n]+))?,\n\s*duration(?:: ([^,\n]+))?,\n\s*\}/g,
    (match, outcomeVar, durationVar) => {
      if (match.includes("kind:")) return match;
      const outcome = outcomeVar ? outcomeVar.trim() : "outcome";
      const duration = durationVar ? durationVar.trim() : "duration";
      const typeExpr = resolveTypeExpr(outcome, cfg);
      return `event: {
      kind: ${kind},
      category: ${cfg.category},
      type: ${typeExpr},
      action: String(${actionExpr}),
      outcome: ${outcome},
      duration: ${duration},
    }`;
    }
  );
}

function patchGcpInlineEvent(content, cfg, actionExpr = '"activity"') {
  const kind = cfg.kind ?? '"event"';
  return content.replace(
    /event: \{\n\s*outcome: (isErr \? "failure" : "success"),\n\s*duration: (randInt\([^)]*\)),\n\s*\}/g,
    (match, outcome, duration) => {
      if (match.includes("kind:")) return match;
      return `event: {
      kind: ${kind},
      category: ${cfg.category},
      type: isErr ? ${cfg.typeErr} : ${cfg.typeOk},
      action: String(${actionExpr}),
      outcome: ${outcome},
      duration: ${duration},
    }`;
    }
  );
}

function patchGcpExtendedServicesEvent(content, cfg, actionExpr) {
  const kind = cfg.kind ?? '"event"';
  return content.replace(
    /event: \{\n(\s*)dataset: ([^\n]+),\n\1module: "gcp",\n\1outcome: (isErr \? "failure" : "success"),\n\1duration: ([^\n]+),\n\1\}/g,
    (match, indent, dataset, outcome, duration) => {
      if (match.includes("kind:")) return match;
      return `event: {
${indent}kind: ${kind},
${indent}category: ${cfg.category},
${indent}type: isErr ? ${cfg.typeErr} : ${cfg.typeOk},
${indent}action: String(${actionExpr}),
${indent}dataset: ${dataset},
${indent}module: "gcp",
${indent}outcome: ${outcome},
${indent}duration: ${duration},
${indent}}`;
    }
  );
}

function patchAzureGenericLogEvent(content, cfg) {
  const kind = cfg.kind ?? '"event"';
  return content.replace(
    /event: \{\n\s*outcome: isErr \? "failure" : "success",\n\s*duration: ([^,]+),\n\s*action: operationName,\n\s*\}/g,
    (match, duration) => {
      if (match.includes("kind:")) return match;
      return `event: {
        kind: ${kind},
        category: ${cfg.category},
        type: isErr ? ${cfg.typeErr} : ${cfg.typeOk},
        action: String(${cfg.actionExpr}),
        outcome: isErr ? "failure" : "success",
        duration: ${duration},
      }`;
    }
  );
}

function fixBrokenTypeExprs(content) {
  return content
    .replace(
      /type: \(isErr \? "failure" : "success" === "failure" \? (\[[^\]]+\]) : (\[[^\]]+\])\)/g,
      "type: isErr ? $1 : $2"
    )
    .replace(/type: "failure" === "failure" \? (\[[^\]]+\]) : (\[[^\]]+\])/g, "type: $1")
    .replace(/type: \("failure" === "failure" \? (\[[^\]]+\]) : (\[[^\]]+\])\)/g, "type: $1")
    .replace(
      /type: \(props\.success \? "success" : "failure" === "failure" \? (\[[^\]]+\]) : (\[[^\]]+\])\)/g,
      "type: props.success ? $2 : $1"
    );
}

const FILES = {
  "src/gcp/generators/compute.ts": {
    category: '["host"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr:
      'typeof action !== "undefined" ? action : (typeof methodName !== "undefined" ? methodName : "compute-engine")',
  },
  "src/gcp/generators/security.ts": {
    category: '["intrusion_detection"]',
    typeOk: '["info"]',
    typeErr: '["denied"]',
    actionExpr: '"security-event"',
  },
  "src/gcp/generators/serverless.ts": {
    category: '["process"]',
    typeOk: '["start"]',
    typeErr: '["error"]',
    actionExpr: '"serverless-invoke"',
  },
  "src/gcp/generators/aiml.ts": {
    category: '["process"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr: '"ml-operation"',
  },
  "src/gcp/generators/management.ts": {
    category: '["configuration"]',
    typeOk: '["info"]',
    typeErr: '["change"]',
    actionExpr: '"management-operation"',
  },
  "src/gcp/generators/devtools.ts": {
    category: '["process"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr: '"devtools-operation"',
  },
  "src/gcp/generators/containers.ts": {
    category: '["host"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr: '"container-operation"',
  },
  "src/gcp/generators/extendedServicesLogs.ts": {
    category: '["process"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr: '"extended-service"',
  },
  "src/azure/generators/platform.ts": {
    category: '["process"]',
    typeOk: '["start"]',
    typeErr: '["error"]',
    actionExpr:
      "typeof evt !== 'undefined' ? evt : (typeof armOp !== 'undefined' ? armOp : (typeof method !== 'undefined' ? `${method} ${path}` : 'platform'))",
  },
  "src/azure/generators/computeExtended.ts": {
    category: '["host"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/dataExtended.ts": {
    category: '["database"]',
    typeOk: '["access"]',
    typeErr: '["error"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/networkingExtended.ts": {
    category: '["network"]',
    typeOk: '["connection"]',
    typeErr: '["denied"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/aiSecurityExtended.ts": {
    category: '["intrusion_detection"]',
    typeOk: '["info"]',
    typeErr: '["denied"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/miscExtended.ts": {
    category: '["configuration"]',
    typeOk: '["info"]',
    typeErr: '["change"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/integrationExtended.ts": {
    category: '["process"]',
    typeOk: '["info"]',
    typeErr: '["error"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/azurePlatformServicesExtended.ts": {
    category: '["configuration"]',
    typeOk: '["info"]',
    typeErr: '["change"]',
    actionExpr: "typeof op !== 'undefined' ? op : operationName",
  },
  "src/azure/generators/genericLog.ts": {
    category: '["configuration"]',
    typeOk: '["change"]',
    typeErr: '["denied"]',
    actionExpr: "operationName",
  },
};

for (const [rel, cfg] of Object.entries(FILES)) {
  const filePath = path.join(ROOT, rel);
  let content = fs.readFileSync(filePath, "utf8");
  const before = content;
  if (rel.startsWith("src/azure/")) {
    content = patchAzureSingleLine(content, cfg);
    content = patchGcpInlineEvent(content, cfg, cfg.actionExpr);
    if (rel.endsWith("genericLog.ts")) {
      content = patchAzureGenericLogEvent(content, cfg);
    }
  } else {
    content = patchGcpMultilineEvent(content, cfg, cfg.actionExpr);
    content = patchGcpInlineEvent(content, cfg, cfg.actionExpr);
    if (rel.endsWith("extendedServicesLogs.ts")) {
      content = patchGcpExtendedServicesEvent(content, cfg, cfg.actionExpr);
    }
  }
  content = fixBrokenTypeExprs(content);
  if (content !== before) {
    fs.writeFileSync(filePath, content);
    console.log("updated", rel);
  } else {
    console.log("unchanged", rel);
  }
}
