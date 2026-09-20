extends Control
# The title screen. Shows the game's name and the best score, waits for Space.

const SAVE_PATH := "user://highscore.cfg"

func _ready() -> void:
	$HighScore.text = "Best: %d" % load_high_score()

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("start"):
		get_tree().change_scene_to_file("res://scenes/main.tscn")

# The high score lives in a small settings file in the user's folder.
static func load_high_score() -> int:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) == OK:
		return int(cfg.get_value("score", "best", 0))
	return 0

static func save_high_score(points: int) -> void:
	var cfg := ConfigFile.new()
	cfg.load(SAVE_PATH)
	if points > int(cfg.get_value("score", "best", 0)):
		cfg.set_value("score", "best", points)
		cfg.save(SAVE_PATH)
