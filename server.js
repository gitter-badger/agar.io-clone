var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

var users = [];
var foods = [];
var sockets = [];

var serverPort = 3000;

var maxSizeMass = 50;
var maxMoveSpeed = 100;

var massDecreaseRatio = 1000;

var foodMass = 1;

var foodRandomWidth = 2000;
var foodRandomHeight = 1000;
var maxFoodCount = 50;

var noPlayer = 0;

var defaultPlayerSize = 10;

var eatableMassDistance = 5;


app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

function genPos(from, to) {
    return Math.floor(Math.random() * to) + from;
}

function addFoods() {
    var rx = genPos(0, foodRandomWidth);
    var ry = genPos(0, foodRandomHeight);
    var food = {
        foodID: (new Date()).getTime(),
        x: rx, y: ry
    };

    foods[foods.length] = food;
}

setInterval(function(){
    if (foods.length < maxFoodCount) {
        addFoods();
    }
    // Clear all food when the server is free (nobody connected)
    if (users.length == noPlayer) {
        foods = [];
    }
}, 1000);

function findPlayer(id) {
    for (var i = 0; i < users.length; i++) {
        if (users[i].playerID == id) {
            return users[i];
        }
    }

    return null;
}

function findPlayerIndex(id) {
    for (var i = 0; i < users.length; i++) {
        if (users[i].playerID == id) {
            return i;
        }
    }

    return -1;
}

function findFoodIndex(id) {
    for (var i = 0; i < foods.length; i++) {
        if (foods[i].foodID == id) {
            return i;
        }
    }

  return -1;
}

function hitTest(start, end, min) {
    var distance = Math.sqrt((start.x - end.x) * (start.x - end.x) + (start.y - end.y) * (start.y - end.y));
    console.log("Hit test: " + distance + " - Min distance: " + min);
    return (distance <= min);
}

io.on('connection', function(socket) {  
    console.log('A user connected. Assigning UserID...');

    var userID = socket.id;
    var currentPlayer = {};

    socket.emit("welcome", userID);

    socket.on("gotit", function(player) {
        player.playerID = userID;
        sockets[player.playerID] = socket;

        if (findPlayer(player.playerID) == null) {
            console.log("Player " + player.playerID + " connected!");
            users.push(player);
            currentPlayer = player;
        }

        socket.emit("playerJoin", users);
        socket.broadcast.emit("playerJoin", users);
        console.log("Total player: " + users.length);
    });

    socket.on('disconnect', function() {
        users.splice(findPlayerIndex(userID), 1);
        console.log('User #' + userID + ' disconnected');
        socket.broadcast.emit("playerDisconnect", users);
    });

    // Heartbeat function, update everytime
    socket.on("playerSendTarget", function(target) {
        if (target.x != currentPlayer.x && target.y != currentPlayer.y) {
            currentPlayer.x += (target.x - currentPlayer.x) / currentPlayer.speed;
            currentPlayer.y += (target.y - currentPlayer.y) / currentPlayer.speed;

            users[findPlayerIndex(currentPlayer.playerID)] = currentPlayer;
      
            for (var f = 0; f < foods.length; f++) {
                if (hitTest(
                    { x: foods[f].x, y: foods[f].y },
                    { x: currentPlayer.x, y: currentPlayer.y },
                    currentPlayer.mass + defaultPlayerSize
                )) {
                    foods[f] = {};
                    foods.splice(f, 1);

                    if (currentPlayer.mass < maxSizeMass) {
                        currentPlayer.mass += foodMass;
                    }

                    if (currentPlayer.speed < maxMoveSpeed) {
                        currentPlayer.speed += currentPlayer.mass / massDecreaseRatio;
                    }

                    console.log("Player eaten");
                    break;
                }
            }

            for (var e = 0; e < users.length; e++) {
                if (hitTest(
                    { x: users[e].x, y: users[e].y },
                    { x: currentPlayer.x, y: currentPlayer.y },
                    currentPlayer.mass + defaultPlayerSize
                )) {
                    if (users[e].mass != 0 && users[e].mass < currentPlayer.mass - eatableMassDistance) {           
                        if (currentPlayer.mass < maxSizeMass) {
                            currentPlayer.mass += users[e].mass;
                        }

                        if (currentPlayer.speed < maxMoveSpeed) {
                            currentPlayer.speed += currentPlayer.mass / massDecreaseRatio;
                        }

                        sockets[users[e].playerID].emit("RIP");
                        users.splice(e, 1);
                        break;
                    }
                }
            }

            // Do some continuos emit
            socket.emit("serverTellPlayerMove", currentPlayer);
            socket.emit("serverTellPlayerUpdateFoods", foods);
            socket.broadcast.emit("serverUpdateAllPlayers", users);
            socket.broadcast.emit("serverUpdateAllFoods", foods);
        }
    });
});

http.listen(serverPort, function(){
    console.log('listening on *:' + serverPort);
});