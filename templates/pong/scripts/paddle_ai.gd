extends Node2D
# The computer's paddle (right side). It follows the ball, a little slowly, so a person can beat it.

@export var speed := 300.0
const HALF_HEIGHT := 50.0
const FIELD_HEIGHT := 540.0

func _physics_process(delta: float) -> void:
	var ball := get_parent().get_node_or_null("Ball")
	if ball == null:
		return
	var target: float = ball.position.y
	var step: float = speed * delta
	if abs(target - position.y) > step:
		position.y += step * sign(target - position.y)
	position.y = clamp(position.y, HALF_HEIGHT, FIELD_HEIGHT - HALF_HEIGHT)

func rect() -> Rect2:
	return Rect2(position.x - 8.0, position.y - HALF_HEIGHT, 16.0, HALF_HEIGHT * 2.0)
