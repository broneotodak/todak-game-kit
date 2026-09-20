extends Node2D
# The ball. Reference solution for step 3 — kept in the kit, never copied into a student's game.

@export var start_speed := 380.0
var velocity := Vector2.ZERO
const SIZE := 16.0
const FIELD_HEIGHT := 540.0

func serve(direction: int) -> void:
	position = Vector2(480, 270)
	# Send the ball towards `direction` with a little up or down, so every point feels different.
	var angle := randf_range(-0.6, 0.6)
	velocity = Vector2(cos(angle) * direction, sin(angle)) * start_speed

func stop() -> void:
	velocity = Vector2.ZERO

func _physics_process(delta: float) -> void:
	position += velocity * delta
	# Bounce off the top and the bottom.
	if position.y < SIZE / 2.0 and velocity.y < 0.0:
		velocity.y = -velocity.y
		get_parent().beep(520.0)
	elif position.y > FIELD_HEIGHT - SIZE / 2.0 and velocity.y > 0.0:
		velocity.y = -velocity.y
		get_parent().beep(520.0)
	# Bounce off a paddle when the two rectangles overlap. The ball speeds up a little each hit.
	for paddle in [get_parent().get_node("Paddle"), get_parent().get_node("PaddleRight")]:
		if rect().intersects(paddle.rect()):
			if (velocity.x < 0.0 and paddle.position.x < position.x) or (velocity.x > 0.0 and paddle.position.x > position.x):
				velocity.x = -velocity.x * 1.05
				# Hitting near the edge of the paddle sends the ball at a sharper angle.
				velocity.y += (position.y - paddle.position.y) * 4.0
				get_parent().beep(440.0)

func rect() -> Rect2:
	return Rect2(position.x - SIZE / 2.0, position.y - SIZE / 2.0, SIZE, SIZE)
