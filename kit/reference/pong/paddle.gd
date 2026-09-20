extends Node2D
# The student's paddle (left side). Reference solution for step 2 — kept in the kit, never copied into a student's game.

@export var speed := 420.0          # pixels per second
const HALF_HEIGHT := 50.0
const FIELD_HEIGHT := 540.0

func _physics_process(delta: float) -> void:
	# Read the two keys: W moves up, S moves down. delta keeps the speed the same on every computer.
	var direction := 0.0
	if Input.is_action_pressed("p1_up"):
		direction -= 1.0
	if Input.is_action_pressed("p1_down"):
		direction += 1.0
	position.y += direction * speed * delta
	# Keep the whole paddle on screen.
	position.y = clamp(position.y, HALF_HEIGHT, FIELD_HEIGHT - HALF_HEIGHT)

# Used by the ball: the rectangle this paddle covers, in field coordinates.
func rect() -> Rect2:
	return Rect2(position.x - 8.0, position.y - HALF_HEIGHT, 16.0, HALF_HEIGHT * 2.0)
