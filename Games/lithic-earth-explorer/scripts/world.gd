extends Node3D

@export var win_height := 2.0
var game_won := false

func _process(delta):
	if game_won:
		return

	var player := $Sigma
	if player.global_position.y > win_height:
		win_game()

func win_game():
	game_won = true
	print("YOU WIN 🎉")
	get_tree().paused = true
