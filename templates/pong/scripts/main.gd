extends Node2D
# The match: keeps score, decides the winner, plays the beep, saves the high score.

const WIN_POINTS := 5
const FIELD := Rect2(0, 0, 960, 540)

var score_left := 0
var score_right := 0
var finished := false

@onready var ball: Node2D = $Ball
@onready var paddle: Node2D = $Paddle
@onready var paddle_right: Node2D = $PaddleRight
@onready var beep_player: AudioStreamPlayer = $Beep

func _ready() -> void:
	# A tiny generated beep, so the game has sound without any audio files.
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = 22050
	gen.buffer_length = 0.2
	beep_player.stream = gen
	beep_player.play()
	$Message.text = ""
	ball.serve(1)

func _physics_process(_delta: float) -> void:
	if finished:
		return
	# A point is scored when the ball leaves the field on the left or the right.
	if ball.position.x < FIELD.position.x - 20:
		score_right += 1
		_after_point(1)
	elif ball.position.x > FIELD.end.x + 20:
		score_left += 1
		_after_point(-1)

func _after_point(direction: int) -> void:
	$ScoreLeft.text = str(score_left)
	$ScoreRight.text = str(score_right)
	beep(660.0)
	if score_left >= WIN_POINTS or score_right >= WIN_POINTS:
		_finish()
	else:
		ball.serve(direction)

func _finish() -> void:
	finished = true
	var you_won := score_left > score_right
	$Message.text = "YOU WIN" if you_won else "YOU LOSE"
	ball.stop()
	var title_script := load("res://scripts/title.gd")
	title_script.save_high_score(score_left)
	await get_tree().create_timer(2.5).timeout
	get_tree().change_scene_to_file("res://scenes/title.tscn")

# Called by the ball when it hits something. Plays a short tone.
func beep(pitch_hz: float = 440.0) -> void:
	var playback := beep_player.get_stream_playback()
	if playback == null:
		return
	var frames := int(22050 * 0.06)
	var phase := 0.0
	for i in range(frames):
		var v := 0.25 * sin(phase * TAU)
		playback.push_frame(Vector2(v, v))
		phase += pitch_hz / 22050.0
