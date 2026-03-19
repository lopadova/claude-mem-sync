import type { Observation } from "../../types/observation";

export function buildDistillationSystemPrompt(): string {
  return `You are a knowledge distillation engine for a software development team. Your job is to analyze a collection of observations (memories) from AI-assisted coding sessions and extract actionable rules and knowledge patterns.

## Input
You will receive a JSON array of observations. Each observation has:
- type: decision, bugfix, feature, discovery, refactor, or change
- title: brief description
- narrative: detailed explanation
- facts: key facts extracted
- concepts: related concepts/topics

## Output Requirements
Respond with valid JSON matching this exact schema:
{
  "rules": [
    {
      "id": "rule-001",
      "rule": "The rule statement (imperative, actionable, CLAUDE.md-compatible)",
      "rationale": "Why this rule exists, based on evidence from observations",
      "category": "One of: architecture, testing, security, performance, conventions, workflow, data, dependencies",
      "confidence": 0.0-1.0,
      "sourceCount": number of observations supporting this rule,
      "sourceTypes": ["decision", "bugfix"],
      "devDiversity": number of unique developers who contributed evidence
    }
  ],
  "knowledgeSections": [
    {
      "title": "Section title (concept cluster name)",
      "concepts": ["concept1", "concept2"],
      "description": "Overview of this knowledge area",
      "patterns": ["Pattern 1 description", "Pattern 2 description"],
      "antiPatterns": ["Anti-pattern 1 with rationale"],
      "sourceCount": number of observations in this cluster
    }
  ]
}

## Rules for Rule Generation
1. Each rule must be supported by at least 2 observations
2. Rules must be actionable and specific (not generic advice like "write good code")
3. Rules must be phrased as imperatives suitable for a CLAUDE.md file
4. Never include specific file paths, code snippets, or developer names
5. Confidence scoring:
   - 0.9-1.0: Supported by 5+ observations across 2+ developers
   - 0.7-0.89: Supported by 3-4 observations or single developer with strong evidence
   - 0.5-0.69: Supported by 2 observations, moderate evidence
   - Below 0.5: Do not include
6. Prioritize rules from decision and bugfix observations (highest signal)
7. Group related rules under the same category

## Rules for Knowledge Sections
1. Cluster observations by shared concepts
2. Extract repeating patterns and anti-patterns
3. Description should synthesize, not just list observations
4. Never attribute knowledge to specific developers
5. Focus on patterns that would help a new team member

## Privacy Constraints
- Never mention developer names or identifiers
- Never include specific code snippets or file paths from observations
- Reference evidence by counts and types only (e.g., "Based on 3 bugfix observations...")
- Use anonymous language: "the team", "developers", "evidence suggests"`;
}

/**
 * Build the user prompt containing the observations to analyze.
 */
export function buildDistillationUserPrompt(
  observations: Observation[],
  project: string,
  excludeTypes: string[],
): string {
  // Filter out excluded types
  const filtered = excludeTypes.length > 0
    ? observations.filter((obs) => !excludeTypes.includes(obs.type))
    : observations;

  // Prepare observation data (strip IDs and internal fields)
  const cleanedObs = filtered.map((obs) => ({
    type: obs.type,
    title: obs.title,
    narrative: obs.narrative,
    facts: obs.facts,
    concepts: obs.concepts,
    created_at_epoch: obs.created_at_epoch,
  }));

  return `Analyze these ${cleanedObs.length} observations from project "${project}" and extract rules and knowledge patterns.

<observations>
${JSON.stringify(cleanedObs, null, 2)}
</observations>

Generate rules and knowledge sections following the schema and constraints in your system prompt. Return only valid JSON, no markdown fencing.`;
}

/**
 * Estimate token count for observations (rough approximation).
 * Uses ~4 chars per token as a conservative estimate.
 */
export function estimateTokens(observations: Observation[]): number {
  const json = JSON.stringify(observations);
  return Math.ceil(json.length / 4);
}
