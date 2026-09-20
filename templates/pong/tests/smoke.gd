extends SceneTree
# Headless checks for the review. Run: godot --headless --path . -s res://tests/smoke.gd
# Prints lines like "CHECK PASS paddle ..." that `tgk review` reads.

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
	# Paddle: hold W for half a second, expect it to move up.
	var start_y := paddle.position.y
	Input.action_press("p1_up")
	for i in range(30):
		await physics_frame
	Input.action_release("p1_up")
	var moved_up := paddle.position.y < start_y - 20.0
	print("CHECK %s paddle %s" % ["PASS" if moved_up else "FAIL", "moves up with W" if moved_up else "does not move with W yet (scripts/paddle.gd)"])
	# Paddle stays on screen: hold S for three seconds.
	Input.action_press("p1_down")
	for i in range(180):
		await physics_frame
	Input.action_release("p1_down")
	var on_screen := paddle.position.y <= 540.0 and paddle.position.y >= 0.0
	print("CHECK %s paddle_clamp %s" % ["PASS" if on_screen else "FAIL", "stays on screen" if on_screen else "leaves the screen"])
	# Ball: after a serve it should move away from the centre within a second.
	ball.serve(1)
	var start := ball.position
	for i in range(60):
		await physics_frame
	var moving := ball.position.distance_to(start) > 40.0
	print("CHECK %s ball %s" % ["PASS" if moving else "FAIL", "launches after serve" if moving else "does not move after serve yet (scripts/ball.gd)"])
	# Ball bounces off the top: keep going for a while and check it never leaves the field vertically.
	var inside := true
	for i in range(300):
		await physics_frame
		if ball.position.y < -20.0 or ball.position.y > 560.0:
			inside = false
	print("CHECK %s ball_bounce %s" % ["PASS" if inside else "FAIL", "stays inside top and bottom" if inside else "flies off the top or bottom (bounce missing)"])
	quit(0)
