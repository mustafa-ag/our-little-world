# CLAUDE.md

Never do the work yourself.
Always dispatch a sub-agent.
Don't always use Fable.
Use Opus 5.5 for easier tasks.

## Model routing

- Fable 5.1: architecture, hard bugs, review
- Opus 5.5: edits, tests, docs, refactors
- Haiku 4.5: lookups and summaries
- Pass model on every Agent call

## Delegation

- One sub-agent per task, plan first
- Run independent sub-agents in parallel
- Read the report, never the files
