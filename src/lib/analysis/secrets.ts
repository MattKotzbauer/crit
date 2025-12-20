/**
 * Secret Detection - finds hardcoded credentials
 *
 * LLMs commonly reintroduce hardcoded secrets. This module
 * uses regex patterns to detect API keys, passwords, tokens, etc.
 */

import { readFileSync } from "fs";
import type { Criticism } from "../criticism/types";
import { generateCriticismId } from "../criticism/store";

interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: "high" | "medium" | "low";
}

const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  {
    name: "AWS Access Key",
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: "high",
  },
  {
    name: "AWS Secret Key",
    pattern: /[A-Za-z0-9/+=]{40}(?=.*aws|.*secret)/gi,
    severity: "high",
  },
  {
    name: "GitHub Token",
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g,
    severity: "high",
  },
  {
    name: "Generic API Key",
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
    severity: "high",
  },
  {
    name: "Bearer Token",
    pattern: /bearer\s+[A-Za-z0-9_\-\.]+/gi,
    severity: "high",
  },

  // Passwords
  {
    name: "Password Assignment",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/gi,
    severity: "high",
  },
  {
    name: "Hardcoded Password",
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["`][^"`\n]{4,}["`]/gi,
    severity: "high",
  },

  // Database
  {
    name: "Database URL with Credentials",
    pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@/gi,
    severity: "high",
  },

  // Private Keys
  {
    name: "Private Key",
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: "high",
  },

  // Tokens
  {
    name: "Slack Token",
    pattern: /xox[baprs]-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/g,
    severity: "high",
  },
  {
    name: "Discord Token",
    pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,
    severity: "high",
  },
  {
    name: "JWT Token",
    pattern: /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
    severity: "medium",
  },

  // Generic secrets
  {
    name: "Secret Assignment",
    pattern: /(?:secret|token|auth)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi,
    severity: "medium",
  },

  // Anthropic/OpenAI
  {
    name: "Anthropic API Key",
    pattern: /sk-ant-[A-Za-z0-9_-]{32,}/g,
    severity: "high",
  },
  {
    name: "OpenAI API Key",
    pattern: /sk-[A-Za-z0-9]{48}/g,
    severity: "high",
  },
];

// Files/paths to skip
const SKIP_PATTERNS = [
  /\.env\.example$/,
  /\.env\.sample$/,
  /\.env\.template$/,
  /package-lock\.json$/,
  /bun\.lockb$/,
  /yarn\.lock$/,
  /node_modules/,
  /\.git/,
  /\.test\./,
  /\.spec\./,
  /mock/i,
  /fixture/i,
  /secrets\.ts$/, // Don't flag the secrets detector itself
  /analysis\//, // Don't flag analysis code
];

export interface SecretFinding {
  pattern: string;
  line: number;
  severity: "high" | "medium" | "low";
  match: string;
}

export function scanFileForSecrets(filePath: string): SecretFinding[] {
  // Skip certain files
  if (SKIP_PATTERNS.some((p) => p.test(filePath))) {
    return [];
  }

  const findings: SecretFinding[] = [];

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      if (!line) continue;

      // Skip comments that look like documentation
      const trimmed = line.trim();
      if (trimmed.startsWith("//") && trimmed.includes("example")) continue;
      if (trimmed.startsWith("#") && trimmed.includes("example")) continue;

      for (const { name, pattern, severity } of SECRET_PATTERNS) {
        // Reset regex state
        pattern.lastIndex = 0;
        const matches = line.match(pattern);

        if (matches) {
          for (const match of matches) {
            // Skip if it looks like a placeholder
            if (
              match.includes("xxx") ||
              match.includes("XXX") ||
              match.includes("your-") ||
              match.includes("YOUR_") ||
              match.includes("<") ||
              match.includes("${") ||
              match.includes("process.env")
            ) {
              continue;
            }

            findings.push({
              pattern: name,
              line: lineNum + 1,
              severity,
              match: match.slice(0, 20) + (match.length > 20 ? "..." : ""),
            });
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return findings;
}

export function secretsToCriticisms(
  filePath: string,
  findings: SecretFinding[]
): Criticism[] {
  return findings.map((finding) => {
    const subject = `potential ${finding.pattern.toLowerCase()}`;

    return {
      id: generateCriticismId("ELIM", subject, [filePath]),
      category: "ELIM",
      subject,
      description: `Found what appears to be a hardcoded ${finding.pattern} at line ${finding.line}. Hardcoded secrets should be moved to environment variables or a secrets manager. Detected pattern: "${finding.match}"`,
      files: [filePath],
      location: `${filePath}:${finding.line}`,
      severity: finding.severity,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  });
}
