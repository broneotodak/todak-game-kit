extends Node2D
# The ball. It already flies across the table. Step 3 of this week: make it BOUNCE.
#
# What you have:
#   - serve(direction) is called by main.gd at the start and after every point. direction is -1 (towards the left) or 1 (towards the right).
#   - The ball already moves in a straight line and leaves the table, which is how points are scored.
#   - Both paddles have a rect() function that returns the rectangle they cover, and rect() below is the ball's.
#   - get_parent().beep(pitch) plays a short sound.
#
# What is missing:
#   - bouncing off the top and bottom edges (y = 0 and y = 540): flip velocity.y,
#   - bouncing off a paddle when the ball's rectangle overlaps the paddle's rectangle: flip velocity.x,
#   - a little up-or-down angle on the serve, so the game is not a straight line.

@export var start_speed := 380.0
var velocity := Vector2.ZERO
const SIZE := 16.0
const FIELD_HEIGHT := 540.0

func serve(direction: int) -> void:
	position = Vector2(480, 270)
	velocity = Vector2(start_speed * direction, 0.0)  # TODO step 3: add a small up or down part, for example randf_range(-0.5, 0.5) * start_speed.

func stop() -> void:
	velocity = Vector2.ZERO

func _physics_process(delta: float) -> void:
	position += velocity * delta
	# TODO step 3: bounce off the top and the bottom (flip velocity.y when position.y leaves the field),
	# then bounce off the paddles (if rect().intersects(paddle.rect()), flip velocity.x). Call get_parent().beep() on every bounce.

func rect() -> Rect2:
	return Rect2(position.x - SIZE / 2.0, position.y - SIZE / 2.0, SIZE, SIZE)
