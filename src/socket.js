import { io } from "socket.io-client";

const URL = "http://localhost:3000";
const socket = io(URL, { autoConnect: false });

// socket.onAny((event, ...args) => {
//   console.log(event, args);
// });

// Преобразуем socket события в обычные DOM события
// ===== ПЛАНЕТЫ =====
socket.on('universe:init', (data) => {
  window.dispatchEvent(new CustomEvent('universe:init', { detail: data }));
});

socket.on('universe:update', (data) => {
  window.dispatchEvent(new CustomEvent('universe:update', { detail: data }));
});

socket.on('planet:added', (data) => {
  window.dispatchEvent(new CustomEvent('planet:added', { detail: data }));
});

socket.on('planet:removed', (userID) => {
  window.dispatchEvent(new CustomEvent('planet:removed', { detail: { userID } }));
});

// ===== ПИСЬМА =====
socket.on('messages:update', (data) => {
  window.dispatchEvent(new CustomEvent('messages:update', { detail: data }));
});

socket.on('message:delivered', (data) => {
  window.dispatchEvent(new CustomEvent('message:delivered', { detail: data }));
});

export default socket;
