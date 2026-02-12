import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import rulesSchema from "./contracts/rulesdsl.schema.json" with { type: "json" };
import type { ValidationIssue, ValidationReport } from "./compiler.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateRulesSchema = ajv.compile(rulesSchema);

export function validateRules(rulesDocument: unknown): ValidationReport {
  const isValid = validateRulesSchema(rulesDocument);
  const issues = isValid ? [] : mapErrors(validateRulesSchema.errors ?? []);

  return {
    ok: issues.length === 0,
    issues,
    summary: {
      errors: issues.length,
      warnings: 0,
    },
  };
}

function mapErrors(errors: ErrorObject[]): ValidationIssue[] {
  return errors
    .map((error) => {
      const pointer = buildPointer(error);

      return {
        severity: "error" as const,
        message: buildMessage(error),
        pointer,
      };
    })
    .sort((left, right) => {
      const leftPointer = left.pointer ?? "";
      const rightPointer = right.pointer ?? "";
      if (leftPointer !== rightPointer) {
        return leftPointer.localeCompare(rightPointer);
      }
      return left.message.localeCompare(right.message);
    });
}

function buildMessage(error: ErrorObject): string {
  const pointer = error.instancePath === "" ? "$" : error.instancePath;
  const message = error.message ?? "invalid value";

  if (error.keyword === "required" && typeof error.params === "object" && error.params !== null) {
    const maybeMissing = Reflect.get(error.params, "missingProperty");
    if (typeof maybeMissing === "string") {
      return `${pointer} missing required property "${maybeMissing}"`;
    }
  }

  return `${pointer} ${message}`;
}

function buildPointer(error: ErrorObject): string | undefined {
  const segments = splitJsonPointer(error.instancePath);

  if (error.keyword === "required" && typeof error.params === "object" && error.params !== null) {
    const maybeMissing = Reflect.get(error.params, "missingProperty");
    if (typeof maybeMissing === "string") {
      segments.push(maybeMissing);
    }
  }

  if (segments.length === 0) {
    return undefined;
  }

  return toPathNotation(segments);
}

function splitJsonPointer(pointer: string): string[] {
  if (pointer === "") {
    return [];
  }

  return pointer
    .split("/")
    .slice(1)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function toPathNotation(segments: string[]): string {
  return segments.reduce((path, segment, index) => {
    const isArrayIndex = /^\d+$/.test(segment);
    if (index === 0) {
      return isArrayIndex ? `[${segment}]` : segment;
    }
    return isArrayIndex ? `${path}[${segment}]` : `${path}.${segment}`;
  }, "");
}
