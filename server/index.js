const httpServer = require("http").createServer();
const Redis = require("ioredis");
const redisClient = new Redis();
const io = require("socket.io")(httpServer, {
  cors: {
    origin: "http://localhost:8080",
  },
  adapter: require("socket.io-redis")({
    pubClient: redisClient,
    subClient: redisClient.duplicate(),
  }),
});

const { setupWorker } = require("@socket.io/sticky");
const crypto = require("crypto");
const randomId = () => crypto.randomBytes(8).toString("hex");

const { RedisSessionStore } = require("./sessionStore");
const sessionStore = new RedisSessionStore(redisClient);

const { RedisMessageStore } = require("./messageStore");
const messageStore = new RedisMessageStore(redisClient);

const { RedisPlanetStore } = require("./planetStore");
const planetStore = new RedisPlanetStore(redisClient);


// Константа для ключа вселенной
const UNIVERSE_KEY = "universe:start";
// Инициализация при запуске (без await на верхнем уровне)
(async function initUniverse() {
  try {
    const universeStartTime = await redisClient.get(UNIVERSE_KEY);
    if (!universeStartTime) {
      await redisClient.set(UNIVERSE_KEY, Date.now());
      console.log("🌍 Вселенная создана");
    } else {
      console.log("🌍 Вселенная существует с", new Date(parseInt(universeStartTime)).toLocaleString());
    }
  } catch (err) {
    console.error("❌ Ошибка инициализации вселенной:", err);
  }
})();

io.use(async (socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;
  if (sessionID) {
    const session = await sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      return next();
    }
  }
  const username = socket.handshake.auth.username;
  if (!username) {
    return next(new Error("invalid username"));
  }
  socket.sessionID = randomId();
  socket.userID = randomId();
  socket.username = username;
  next();
});

io.on("connection", async (socket) => {
  console.log(`🔵 Подключился: ${socket.username} (${socket.userID})`);
  
  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
  });

  // emit session details
  socket.emit("session", {
    sessionID: socket.sessionID,
    userID: socket.userID,
  });

  // join the "userID" room
  socket.join(socket.userID);

  // fetch existing users
  const users = [];
  const [messages, sessions] = await Promise.all([
    messageStore.findMessagesForUser(socket.userID),
    sessionStore.findAllSessions(),
  ]);
  const messagesPerUser = new Map();
  messages.forEach((message) => {
    const { from, to } = message;
    const otherUser = socket.userID === from ? to : from;
    if (messagesPerUser.has(otherUser)) {
      messagesPerUser.get(otherUser).push(message);
    } else {
      messagesPerUser.set(otherUser, [message]);
    }
  });

  sessions.forEach((session) => {
    users.push({
      userID: session.userID,
      username: session.username,
      connected: session.connected,
      messages: messagesPerUser.get(session.userID) || [],
    });
  });
  socket.emit("users", users);

  // Проверяем, есть ли уже планета для этого userID
  let planet = await planetStore.findPlanet(socket.userID);
  
  if (!planet) {
    // Новый пользователь — создаем планету
    planet = await planetStore.savePlanet(socket.userID, {
      username: socket.username
    });
    console.log(`🪐 Новая планета для ${socket.username}`);
  } else {
    // Переподключение — используем существующую
    console.log(`🔄 Переподключение ${socket.username}, планета существует`);
  }

  // Отправляем всем новую планету
  io.emit("planet:added", planet);
  
  // Отправляем новому пользователю все существующие планеты
  const allPlanets = await planetStore.findAllPlanets();
  const startTime = await redisClient.get(UNIVERSE_KEY);
  socket.emit("universe:init", {
    startTime: parseInt(startTime),
    planets: allPlanets
  });

  // notify existing users
  socket.broadcast.emit("user connected", {
    userID: socket.userID,
    username: socket.username,
    connected: true,
    messages: [],
  });

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on("private message", ({ content, to }) => {
    const message = {
      content,
      from: socket.userID,
      to,
    };
    socket.to(to).to(socket.userID).emit("private message", message);
    messageStore.saveMessage(message);
  });

  // notify users upon disconnection
  socket.on("disconnect", async () => {
    console.log(`🔴 Отключился: ${socket.username}`);

     // Ждем 5 секунд перед удалением
    setTimeout(async () => {
      const matchingSockets = await io.in(socket.userID).allSockets();
      const isDisconnected = matchingSockets.size === 0;
      if (isDisconnected) {
        // notify other users
        socket.broadcast.emit("user disconnected", socket.userID);
        // update the connection status of the session
        sessionStore.saveSession(socket.sessionID, {
          userID: socket.userID,
          username: socket.username,
          connected: false,
        });

        await planetStore.removePlanet(socket.userID);
        io.emit("planet:removed", socket.userID);
        console.log(`🗑️ Планета удалена для ${socket.username}`);
      }
    }, 5000); // 5 секунд
  });
});

// Рассылка углов ВСЕМ клиентам (10 раз в секунду)
setInterval(async () => {
  try {
    // const startTime = await redisClient.get(UNIVERSE_KEY);
    const planets = await planetStore.findAllPlanets();

    // ВРЕМЕННО: посмотрим что в planets
    // console.log('📦 Планеты из Redis:', JSON.stringify(planets, null, 2));

    const currentTime = Date.now();
    
    const angles = planets.map(p => {
      // // Проверим каждое значение
      // console.log('🔍 Данные планеты:', {
      //   startAngle: p.startAngle,
      //   orbitSpeed: p.orbitSpeed,
      //   createdAt: p.createdAt,
      //   currentTime
      // });
      
      const angle = (p.startAngle + p.orbitSpeed * (currentTime - p.createdAt) / 1000) % (Math.PI * 2);
      return {
        userID: p.userID,
        angle
      };
      // userID: p.userID,
      // angle: (p.startAngle + p.orbitSpeed * (currentTime - p.createdAt) / 1000) % (Math.PI * 2)
    });

    // console.log('📐 Рассчитанные углы:', angles);

    io.emit("universe:update", { 
      time: currentTime,
      angles 
    });
  } catch (err) {
    // console.error("❌ Ошибка рассылки углов:", err);
  }
}, 50); // 100ms = 10 раз в секунду


setupWorker(io);
