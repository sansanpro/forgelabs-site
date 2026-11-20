# ForgeLabs site: instructions for Claude

## Keep a record of every conversation

The owner wants every prompt and conversation for this project remembered, so a new session
can pick up where the last one stopped.

**At the start of every session:**
1. Read the memory index (`MEMORY.md` in the project's memory directory) and the newest file in
   its `conversations/` folder.
2. Check the "Next" sections of `docs/PLAN.md` and `docs/SITE-REVAMP.md`.

**During every session:**
- Write each of the owner's prompts **word for word** to that day's log:
  `conversations/YYYY-MM-DD.md` in the memory directory. Under each prompt, add a short summary of
  the answer and of what was done: files changed, commands run, commits, deploys, and anything
  left unfinished or unverified.
- Update the log after every reply, not only at the end, because a session can stop at any point.
- Save a separate memory for each decision, preference or open item the repo doesn't record.

**Keep the logs out of the repo.** GitHub Pages serves the whole repo publicly, so conversation
logs go in the memory directory, never in this repo.

**When work finishes,** update the "Next" list in the relevant plan doc so the repo carries the
handoff too.
