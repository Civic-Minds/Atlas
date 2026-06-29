# Custom Project Rules

- **Linear Updates**: When updating Linear issues (e.g. setting state to In Review or Done), always retrieve the relevant git commit hashes (abbreviated to 7 characters, e.g. `9579695`) and messages, and append them to the Linear issue description.
- **No Permission Prompts for Versioning**: Do not ask the user for permission or confirmation before performing the task closure workflow (updating the changelog, updating Linear, and committing). Conclude the technical implementation turn, and perform the versioning/commit workflow automatically in the subsequent conversational turn.
