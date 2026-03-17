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

const activeMessages = new Map(); // id -> message
// Функция для генерации ID сообщений
const generateMessageId = () => crypto.randomBytes(8).toString("hex");

const ships = new Map();

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

  // Создаем ракету для пользователя
  const ship = {
    userID: socket.userID,
    x: planet.orbitRadius, // начальная позиция (на орбите)
    y: 0,
    speed: 0,
    planetRadius: planet.orbitRadius,
    planetAngle: 0, // меняется только если ракета находится на планете == не в полёте == не меняются поля Х,Y
    planetId: socket.userID, // к какой планете привязана (своя)
    isDocked: true,
    isFlying: false
  };

  ships.set(socket.userID, ship);

  // notify existing users
  socket.broadcast.emit("user connected", {
    userID: socket.userID,
    username: socket.username,
    connected: true,
    messages: [],
  });

  socket.on("ship:takeoff", ({ lastX, lastY }) => {
    const ship = ships.get(socket.userID);
    if (ship) {
      ship.isDocked = false;
      ship.x = lastX
      ship.y = lastY
      ship.targetX = undefined;
      ship.targetY = undefined;
      ship.isFlying = false;
      // Корабль остается на месте, но теперь может лететь
    }
  });

  socket.on("ship:fly", ({ x, y }) => {
    const ship = ships.get(socket.userID);
    if (ship && !ship.isDocked) {
      ship.targetX = x;
      ship.targetY = y;
      ship.isFlying = true;
      ship.speed = 10; // пикселей за тик
    }
  });

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on("private message", ({ content, to }) => {
    const messageId = generateMessageId();
    const now = Date.now();
    const duration = 5000; // 5 секунд полета
    
    const message = {
      id: messageId,
      from: socket.userID,
      to,
      content,
      startTime: now,
      duration: duration
    };
    
    // Сохраняем в активные сообщения
    activeMessages.set(messageId, message);

    console.log(`✉️ Письмо от ${socket.username} к ${to} (${messageId})`);
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
        io.emit("ship:removed", socket.userID);
        console.log(`🗑️ Ракета удалена для ${socket.username}`);
      }
    }, 5000); // 5 секунд
  });
});

// Рассылка углов ВСЕМ клиентам (10 раз в секунду)
setInterval(async () => {
  try {
    // const startTime = await redisClient.get(UNIVERSE_KEY);
    const planets = await planetStore.findAllPlanets();
    const currentTime = Date.now();

    const angles = planets.map(p => {
      const angle = (p.startAngle + p.orbitSpeed * (currentTime - p.createdAt) / 1000) % (Math.PI * 2);
      return {
        userID: p.userID,
        angle
      };
    });

    // Собираем данные о ракетах
    const shipsData = [];
    ships.forEach((ship, userID) => {
      if (ship.isDocked) {
        // Если припаркована — позиция = позиция планеты
        const planetAngle = angles.find(a => a.userID === userID).angle
        if (planetAngle) {
          ship.planetAngle = planetAngle;
        }
      } else if (ship.isFlying) {
        // Логика движения к цели
        const dx = ship.targetX - ship.x;
        const dy = ship.targetY - ship.y;
        const distance = Math.hypot(dx, dy);
        
        // if (distance < 1) {
        //   // Долетели
        //   ship.isFlying = false;
        //   ship.isDocked = false; // свободный полет
        // } else {
        //   // Двигаемся
        //   ship.x += (dx / distance) * ship.speed;
        //   ship.y += (dy / distance) * ship.speed;
        // }
        if (distance < ship.speed) {
          // Если до цели меньше шага — просто ставим точно в цель
          ship.x = ship.targetX;
          ship.y = ship.targetY;
          ship.isFlying = false;
        } else {
          ship.x += (dx / distance) * ship.speed;
          ship.y += (dy / distance) * ship.speed;
        }
      }
      
      shipsData.push({
        userID: ship.userID,
        x: ship.x,
        y: ship.y,
        planetRadius: ship.planetRadius,
        planetAngle: ship.planetAngle, 
        isDocked: ship.isDocked,
        isFlying: ship.isFlying
      });
    });
    

    io.emit("universe:update", { 
      time: currentTime,
      angles,
      ships: shipsData
    });

    const messagesToRemove = [];
    const messagesData = [];

    activeMessages.forEach((msg, id) => {
      const progress = (currentTime - msg.startTime) / msg.duration;
      
      if (progress >= 1) {
        messagesToRemove.push({
          id,
          from: msg.from,
          to: msg.to,
          content: msg.content
        });
      } else {
        // Находим углы планет отправителя и получателя
        const fromPlanet = planets.find(p => p.userID === msg.from);
        const toPlanet = planets.find(p => p.userID === msg.to);
        const startAngle = angles.find(a => a.userID === msg.from).angle;
        const finishAngle = angles.find(a => a.userID === msg.to).angle;

        let futureAngle = finishAngle + toPlanet.orbitSpeed * msg.duration / 1000;

        if (futureAngle > startAngle) {
          futureAngle += 2 * Math.PI;
        }

        let diff = Math.abs(futureAngle - startAngle);
        if (diff < 2 * Math.PI) {
          futureAngle += 2 * Math.PI;
        }

        if (fromPlanet && toPlanet && startAngle && finishAngle) {
          messagesData.push({
            id: msg.id,
            from: msg.from,
            to: msg.to,
            content: msg.content,
            fromRadius: fromPlanet.orbitRadius,
            toRadius: toPlanet.orbitRadius,
            startAngle: startAngle,
            targetAngle: futureAngle,
            startTime: currentTime,
            duration: msg.duration,
            progress: progress,
            // Добавляем ВСЁ что нужно для отрисовки
          });
        }
      }
    });

    // Удаляем доставленные письма
    messagesToRemove.forEach(({ id, from, to, content }) => {
      activeMessages.delete(id);

      // Отправляем в чат ПОЛУЧАТЕЛЮ
      io.to(to).to(from).emit("private message", { 
        content, 
        from, 
        to 
      });
      
      // Сохраняем в историю (для чата)
      messageStore.saveMessage({
        content,
        from,
        to
      });

      io.emit("message:delivered", { id });
    });

    if (messagesData.length > 0) {
      io.emit("messages:update", { messages: messagesData });
    }

  } catch (err) {
    console.error("❌ Ошибка рассылки углов:", err);
  }
}, 50);


setupWorker(io);
