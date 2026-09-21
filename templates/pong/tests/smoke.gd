extends SceneTree
# Headless checks for the review. Run: godot --headless --path . -s res://tests/smoke.gd
# Prints lines like "CHECK PASS paddle ..." that `tgk review` reads. Step ids: paddle, ball.

func _initialize() -> void:
	var main_scene: PackedScene = load("res://scenes/main.tscn")
	if main_scene == null:
		print("CHECK FAIL scaffold main.tscn does not load")
		quit(1)
		return
	print("CHECK PASS scaffold project loads")
	var main := main_scene.instantiate()
	root.add_child(main)
	await process_frame
	var paddle: Node2D = main.get_node("Paddle")
	var ball: Node2D = main.get_node("Ball")
	# The table plays by itself: after the serve the ball is in motion within a second.
	var serve_pos := ball.position
	for i in range(45):
		await physics_frame
	var points: int = main.score_left + main.score_right
	var in_motion: bool = ball.position.distance_to(serve_pos) > 40.0 or points > 0
	print("CHECK %s plays %s" % ["PASS" if in_motion else "FAIL", "the ball is in motion after the serve" if in_motion else "the ball does not move after the serve (scripts/ball.gd)"])
	# Step 2 — paddle: hold W for half a second, expect it to move up.
	var start_y := paddle.position.y
	Input.action_press("p1_up")
	for i in range(30):
		await physics_frame
	Input.action_release("p1_up")
	var moved_up := paddle.position.y < start_y - 20.0
	print("CHECK %s paddle %s" % ["PASS" if moved_up else "FAIL", "moves up with W" if moved_up else "does not move with W yet (scripts/paddle.gd)"])
	Input.action_press("p1_down")
	for i in range(180):
		await physics_frame
	Input.action_release("p1_down")
	var on_screen := paddle.position.y <= 540.0 and paddle.position.y >= 0.0
	print("CHECK %s paddle_clamp %s" % ["PASS" if on_screen else "FAIL", "stays on screen" if on_screen else "leaves the screen"])
	# Step 3 — ball bounces: aim the ball at the top edge and expect its vertical direction to flip before it leaves.
	main.finished = true  # stop scoring during this test
	ball.position = Vector2(480, 120)
	ball.velocity = Vector2(120.0, -420.0)
	var flipped := false
	for i in range(90):
		await physics_frame
		if ball.velocity.y > 0.0:
			flipped = true
			break
	print("CHECK %s ball %s" % ["PASS" if flipped else "FAIL", "bounces off the top and bottom" if flipped else "flies off the top instead of bouncing (scripts/ball.gd)"])
	# Ball bounces off a paddle: put the ball just right of the student's paddle, moving left, expect velocity.x to flip.
	ball.position = Vector2(paddle.position.x + 40.0, paddle.position.y)
	ball.velocity = Vector2(-400.0, 0.0)
	var hit := false
	for i in range(30):
		await physics_frame
		if ball.velocity.x > 0.0:
			hit = true
			break
	print("CHECK %s ball_paddle %s" % ["PASS" if hit else "FAIL", "bounces off the paddle" if hit else "passes straight through the paddle (scripts/ball.gd)"])
	quit(0)
