var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var path = require('path');

users = {}
connections = []
inProgressGames = {}

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', function(socket){
  /* === BEGIN CONNECTIONS === */
  // connected
  connections.push(socket);
  console.log('Total connected users %s', connections.length);

  // disconnected
  socket.on('disconnect', function(){
    console.log('%s disconnected', socket.username);
    // io.emit('player status', {msg: socket.username + ' left the game.'})
    // remove user from connections
    connections.splice(connections.indexOf(socket), 1);
    console.log('Total connected users %s', connections.length);
    if (socket.gamecode && socket.gamecode in users)
	    users[socket.gamecode].splice(users[socket.gamecode].indexOf(socket.username), 1);
    updateUsernames(socket.gamecode);

    // if the user drops, need to handle properly
    // case 1: drop during guess the phrase

  });

  /* === END CONNECTIONS === */
  // chat message events
  socket.on('send message', function(data){
    console.log('%s sent message: %s', socket.username, data);
    io.to(socket.gamecode).emit('receive message', {msg: data, username: socket.username});
  });

  /* === NEW PLAYERS === */
  socket.on('new player', function(data, callback){

    socket.username = data.username;
    socket.gamecode = data.gamecode;

    callback(true);
  	if (socket.gamecode == ""){
  		socket.gamecode = generateGameCode();
    }

  	socket.join(socket.gamecode);
  	io.to(socket.gamecode).emit('get gamecode', socket.gamecode);
  	io.to(socket.gamecode).emit('player status', {msg: socket.username + ' joined the game.'});
  	console.log('%s joined the game %s.', socket.username, socket.gamecode);
  	// TO DO: REMOVE GAME IF EVERYONE IS OUT
  	if (users[socket.gamecode] == null)
  		users[socket.gamecode] = [];
  	users[socket.gamecode].push(socket.username);
    console.log(users[socket.gamecode]);
  	updateUsernames(socket.gamecode);
  });

  /* === Start Game === */
  socket.on('start game', function(data){
    console.log("Game %s started by %s", data.gamecode, data.username);
    // put users in in progress games
    
    inProgressGames[data.gamecode] = {readyCount: 0, userPositions: {}, data:[...Array(users[socket.gamecode].length).keys()].map(obj => [])};
    console.log(inProgressGames[data.gamecode].data);
    io.to(socket.gamecode).emit('start game');
  });

  socket.on('submit phrase', function(data){
    inProgressGames[data.gamecode].readyCount++;
    io.to(socket.gamecode).emit('user ready', data.username);

    // set up initial positions based on who submits first
    user_position = inProgressGames[data.gamecode].readyCount - 1;
    inProgressGames[data.gamecode].userPositions[data.username] = user_position;

    // store data
    inProgressGames[data.gamecode].data[user_position] = [];
    source = {type: data.type, data: data.payload, user: data.username};
    inProgressGames[data.gamecode].data[user_position].push({source_user: data.username});
    inProgressGames[data.gamecode].data[user_position].push(source);

    // when everyone is ready
    userCount = users[data.gamecode].length;
    if (inProgressGames[data.gamecode].readyCount >= userCount)
    {
      inProgressGames[data.gamecode].readyCount = 0;

      users[data.gamecode].forEach(function (user) 
      {
        inProgressGames[data.gamecode].userPositions[user] += 1;
        inProgressGames[data.gamecode].userPositions[user] %= (users[data.gamecode].length);
      });

      payload = {};
      users[data.gamecode].forEach(function (user) 
      {
        user_position = inProgressGames[data.gamecode].userPositions[user];
        last_index = inProgressGames[data.gamecode].data[user_position].length - 1;
        payload[user] = inProgressGames[data.gamecode].data[user_position][last_index];
        // TODO: show messages when there needs to be a wait
      });
      io.to(socket.gamecode).emit('submit phrase everyone ready', payload);
    }
  });

  socket.on('submit drawing', function(data){
    inProgressGames[data.gamecode].readyCount++;
    io.to(socket.gamecode).emit('user ready', data.username);

    user_position = inProgressGames[data.gamecode].userPositions[data.username];
    source = {type: data.type, data: data.payload, user: data.username};
    inProgressGames[data.gamecode].data[user_position].push(source);

    // when everyone is ready
    userCount = users[data.gamecode].length;
    if (inProgressGames[data.gamecode].readyCount >= userCount && userCount > 1)
    {
      inProgressGames[data.gamecode].readyCount = 0;

      // check if done
      turnCount = inProgressGames[data.gamecode].data[user_position].length - 1; // minus 1 for username as first item
      if ( turnCount >= userCount){
        payload = inProgressGames[data.gamecode].data;
        console.log(payload);
        io.to(socket.gamecode).emit('finished', payload);
        // delete game
        // delete users

        console.log(socket.gamecode);
        if (socket.gamecode){
          delete users[socket.gamecode];
          delete inProgressGames[socket.gamecode];
        }
        return;
      }

      // otherwise continue
      users[data.gamecode].forEach(function (user)
      {
        inProgressGames[data.gamecode].userPositions[user] += 1;
        inProgressGames[data.gamecode].userPositions[user] %= (users[data.gamecode].length);
      });

      payload = {};
      users[data.gamecode].forEach(function (user) 
      {
        user_position = inProgressGames[data.gamecode].userPositions[user];
        last_index = inProgressGames[data.gamecode].data[user_position].length - 1;
        payload[user] = inProgressGames[data.gamecode].data[user_position][last_index];
      });
      io.to(socket.gamecode).emit('submit drawing everyone ready', payload); 
    }
       
  });

  socket.on('submit guess', function(data){
    inProgressGames[data.gamecode].readyCount++;
    io.to(socket.gamecode).emit('user ready', data.username);

    // store data
    user_position = inProgressGames[data.gamecode].userPositions[data.username];
    source = {type: data.type, data: data.payload, user: data.username};
    inProgressGames[data.gamecode].data[user_position].push(source);

    // when everyone is ready 
    userCount = users[data.gamecode].length;
    if (inProgressGames[data.gamecode].readyCount >= userCount)
    {
      inProgressGames[data.gamecode].readyCount = 0;

      // check if done
      turnCount = inProgressGames[data.gamecode].data[user_position].length;
      if ( turnCount > userCount){
        payload = inProgressGames[data.gamecode].data;
        io.to(socket.gamecode).emit('finished', payload);

        console.log(socket.gamecode);
        if (socket.gamecode){
          delete users[socket.gamecode];
          delete inProgressGames[socket.gamecode];
        }

        return;
      }

      // otherwise continue
      users[data.gamecode].forEach(function (user) 
      {
        inProgressGames[data.gamecode].userPositions[user] += 1;
        inProgressGames[data.gamecode].userPositions[user] %= (users[data.gamecode].length);
      });

      payload = {};
      users[data.gamecode].forEach(function (user) 
      {
        user_position = inProgressGames[data.gamecode].userPositions[user];
        last_index = inProgressGames[data.gamecode].data[user_position].length - 1;
        payload[user] = inProgressGames[data.gamecode].data[user_position][last_index];
      });
      io.to(socket.gamecode).emit('submit guess everyone ready', payload);
    }
  });

  function updateUsernames(gamecode){
    console.log(users[gamecode]);
  	io.to(gamecode).emit('get users', users[gamecode]);
  }

  function generateGameCode() {
    var text = "";
    var possible = "ACEFGHJKMNPQRSTUWXY2345679";

    for (var i = 0; i < 4; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
  }
});

http.listen(3000, function(){
  console.log('listening on *:3000');
});

