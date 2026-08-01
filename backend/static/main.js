var socket = new WebSocket('ws://localhost:8000/ws/graph/');
socket.onmessage = function (e) {
    var jsonData = JSON.parse(e.data);
    console.log(jsonData);
    document.querySelector('#app').innerText = jsonData.graph;
}

