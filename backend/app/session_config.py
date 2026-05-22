# One full curriculum unit is split into two teaching sessions (first half + second half of the unit).
SESSION_HALVES_PER_UNIT = 2

# Target live teaching time for ONE half-session (~half the chapter). Shown as session_units[].minutes.
SESSION_UNIT_MINUTES = 90

# Full unit if both halves are completed (informational; not stored per row in all APIs).
FULL_UNIT_MINUTES = SESSION_UNIT_MINUTES * SESSION_HALVES_PER_UNIT
