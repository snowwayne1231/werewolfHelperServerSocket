var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var now_room_id = 1;
var room_list = [];
var socket_list = [];

app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});

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
                    gameRound: 1,
                    process: 0,
                    playerLeft: [],
                    playerRight: [],
                    witchesPoison: true,
                    witchesPoisonTarget: -1,
                    witchesHealth: true,
                    lastTimeGuard: -1,
                },
                timestamp,
            }

            room_list = room_list.filter(room => (room.timestamp + 10800000) < timestamp);
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
                json.payload = room.gameData;
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
                var sameRoomSockets = socket_list.filter(s => s.room_id == my_room_id || s.join_room_id == my_room_id);
                json.payload = room.gameData;
                send(sameRoomSockets, json);
              } else {
                sendError(socket, '此房間已經解散');
              }
              
            } else {
              sendError(socket, '未加入房間');
            }
            
            break;
        case 'getroomlist':
            var roomlist = room_list.filter(r => r.host_socket != socket).map(r => r.id);
            json.payload = roomlist;
            send([socket], json);
            break;
        default:
    }
    return json;
  });
});

http.listen(3000, function(){
  console.log('listening on *:3000');
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