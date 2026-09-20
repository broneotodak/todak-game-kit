extends Node2D
# The student's paddle (left side). Step 2 of this week: make it move with W and S.
#
# What you have:
#   - Input actions "p1_up" (W) and "p1_down" (S) already exist in project.godot.
#   - The playfield is 540 pixels tall; this paddle is 100 pixels tall.
#   - Godot calls _physics_process(delta) about 60 times a second; delta is the time since the last call.
#
# What is missing:
#   - Reading the input and changing position.y, and keeping the paddle inside the field.

@export var speed := 420.0          # pixels per second
const HALF_HEIGHT := 50.0
const FIELD_HEIGHT := 540.0

func _physics_process(delta: float) -> void:
	pass  # TODO step 2: move the paddle up with p1_up and down with p1_down, then clamp position.y so it stays on screen.

# Used by the ball: the rectangle this paddle covers, in field coordinates.
func rect() -> Rect2:
	return Rect2(position.x - 8.0, position.y - HALF_HEIGHT, 16.0, HALF_HEIGHT * 2.0)
