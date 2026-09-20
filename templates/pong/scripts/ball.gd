extends Node2D
# The ball. Step 3 of this week: launch it and make it bounce.
#
# What you have:
#   - serve(direction) is called by main.gd at the start and after every point. direction is -1 (towards the left) or 1 (towards the right).
#   - stop() is called when the match ends.
#   - Both paddles have a rect() function that returns the rectangle they cover.
#   - get_parent().beep(pitch) plays a short sound.
#
# What is missing:
#   - A velocity, moving by velocity * delta each physics step,
#   - bouncing off the top and bottom edges (y = 0 and y = 540),
#   - bouncing off a paddle when the ball's rectangle overlaps the paddle's rectangle.

@export var start_speed := 380.0
var velocity := Vector2.ZERO
const SIZE := 16.0
const FIELD_HEIGHT := 540.0

func serve(direction: int) -> void:
	position = Vector2(480, 270)
	velocity = Vector2.ZERO  # TODO step 3: give the ball a velocity towards `direction`, with a little up or down.

func stop() -> void:
	velocity = Vector2.ZERO

func _physics_process(delta: float) -> void:
	pass  # TODO step 3: move the ball, bounce off the top and bottom, bounce off the paddles (use rect() and Rect2.intersects). Call get_parent().beep() on every bounce.

func rect() -> Rect2:
	return Rect2(position.x - SIZE / 2.0, position.y - SIZE / 2.0, SIZE, SIZE)
