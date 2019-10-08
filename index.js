var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var path = require('path');
var now_room_id = 1;
var room_list = [];
var socket_list = [];
var port = 80;

app.get('/', function(req, res){
  res.sendFile(__dirname + '/www/index.html');
});

app.get('/app.js', function(req, res){
  res.sendFile(__dirname + '/www/app.js');
});

app.get('/app.css', function(req, res){
  res.sendFile(__dirname + '/www/app.css');
});

app.get('/static/*', staticFile);

app.get('/fonts/*', staticFile);

function staticFile(req, res) {
  var filePath = '.' + req.url;
  
  var nextPath = (__dirname + '/www/' + filePath).replace(/[\/\\]{2}/g, '');
  res.sendFile(nextPath);
}

io.on('connection', function(socket){
  
  socket_list.push(socket);
  console.log('a user connected, ::', socket_list.length);

  socket.on('disconnect', function(){
    socket_list = socket_list.filter(s => s != socket);
    console.log('user disconnected, :: ', socket_list.length);
    
  });

  socket.on('message', function(msg){
    console.log('message: ' + msg);
    var json = JSON.parse(msg);
    switch(json.type) {
        case 'create':
            var next_room_id = Math.floor(now_room_id);
            room_list = room_list.filter(r => r.id != socket.room_id);
            socket.room_id = next_room_id;
            var timestamp = new Date().getTime();
            var room_obj = {
                id: socket.room_id,
                password: json.password || '',
                gameSetting: json.setting,
                gameData: {
                    isNight: false,
                    round: 1,
                    process: 0,
                    playerLeft: [],
                    playerRight: [],
                    witchesPoison: true,
                    witchesPoisonTarget: -1,
                    witchesHealth: true,
                    lastTimeGuard: -1,
                    ...json.data,
                },
                timestamp,
            }

            room_list = room_list.filter(room => (room.timestamp + 36000000) > timestamp);
            room_list.push(room_obj);
            
            now_room_id++;
            json.payload = room_obj.id;
            send(socket, json);
            break;
        case 'join':
            var room_id = json.room_id;
            var password = json.password;
            var room = room_list.find(r => r.id == room_id);
            if (room) {
              if (room.password == password) {
                socket.join_room_id = room_id;
                json.payload = {
                  data: room.gameData,
                  setting: room.gameSetting,
                };
                send(socket, json);
              } else {
                sendError(socket, '錯誤的密碼');
              }
            } else {
              console.log(`room_id : ${room_id} is not exist.`);
              sendError(socket, '不存在的房間');
            }
            break;
        case 'broadcast':
            var my_room_id = socket.room_id || socket.join_room_id;
            if (my_room_id && my_room_id > 0) {
              var room = room_list.find(r => r.id == my_room_id);
              if (room) {
                room.gameData = json.data;
                json.payload = room.gameData;
                send(getSameRoomSockets(my_room_id, socket), json);
              } else {
                sendError(socket, '此房間已經解散');
              }
              
            } else {
              // sendError(socket, '未加入房間');
            }
            
            break;
        case 'getroomlist':
            var roomlist = room_list.map(r => r.id);
            json.payload = roomlist;
            send([socket], json);
            break;
        case 'playmp3':
            var my_room_id = socket.room_id || socket.join_room_id;
            if (my_room_id && my_room_id > 0) {
              var room = room_list.find(r => r.id == my_room_id);
              if (room) {
                json.payload = json.key;
                send(getRoomHostSockets(my_room_id), json);
              } else {
                sendError(socket, '此房間已經解散');
              }
              
            } else {
              // sendError(socket, '未加入房間');
            }
            break;
        case 'command':
            var my_room_id = socket.room_id || socket.join_room_id;
            if (my_room_id && my_room_id > 0) {
              send(getSameRoomSockets(my_room_id, socket), json);
            }
            break;
        case 'reset':
            var room_id = parseInt(json.room_id, 10);
            room = room_list.find(r => r.id == room_id);
            
            var timestamp = new Date().getTime();
            room.gameSetting = json.setting;
            room.gameData = json.data;
            room.timestamp = timestamp;
            
            json.payload = room_id;
            send(getSameRoomSockets(room_id, socket), json);
        default:
    }
    return json;
  });
});

http.listen(process.env.PORT || port, function(){
  console.log('werewolf socket start.');
});


function sendError(socket, err) {
  return socket.send({error: err});
}

function send(sockets, json) {
  return Array.isArray(sockets)
    ? sockets.map(s => {
      return s.send(json);
    })
    : sockets.send(json);
}

function getSameRoomSockets(room_id, withoutSelfSocket = null, includeGuest = true) {
  return socket_list.filter(s => {
    return (s.room_id == room_id || (includeGuest && s.join_room_id == room_id)) &&
      !(withoutSelfSocket && withoutSelfSocket == s);
  });
}

function getRoomHostSockets(room_id) {
  return socket_list.filter(s => {
    return s.room_id == room_id;
  });
}