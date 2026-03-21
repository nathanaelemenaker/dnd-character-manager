
# Update Notes
- Switched to `@node-rs/argon2@^1.7.0` to avoid ETARGET error during npm install.
- Added restart policy and DB wait-loop in docker-compose.yml for resilience.
- Keep using bind-mounted source; installs happen on start. Consider switching to a prebuilt image for faster restarts later.
