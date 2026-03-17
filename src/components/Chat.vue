<template>
  <div>
    <div class="left-panel">
      <user
        v-for="user in users"
        :key="user.userID"
        :user="user"
        :selected="selectedUser === user"
        @select="onSelectUser(user)"
      />
      <!-- В шаблон, например после списка пользователей -->
      <div class="takeoff-button" @click="onShipTakeoff">🚀 Взлететь</div>
    </div>
    <!-- Добавляем контейнер для Pixi -->
    <div ref="pixiContainer" class="pixi-container"></div>
    <message-panel
      v-if="selectedUser"
      :user="selectedUser"
      @input="onMessage"
      class="right-panel"
    />
  </div>
</template>

<script>
import socket from "../socket";
import User from "./User";
import MessagePanel from "./MessagePanel";
// Импортируем Planet
import Planet from "./Planet.js";
import Message from "./Message.js";
import Ship from "./Ship.js";
import * as PIXI from 'pixi.js';

export default {
  name: "Chat",
  components: { User, MessagePanel },
  data() {
    return {
      selectedUser: null,
      users: [],
      // Добавляем данные для Pixi
      app: null,
      planets: new Map(),
      centerX: 0,
      centerY: 0, 
      activeMessages: new Map(),
      ships: new Map()
    };
  },
  methods: {
    onUniverseInit(event) {
      const { startTime, planets } = event.detail;
      console.log('🔥 Вселенная инициализирована', planets.length, 'планет', startTime);
      // Здесь создаем все планеты
      planets.forEach(p => this.addPlanet(p));
    },
    
    onUniverseUpdate(event) {
      const { angles, ships } = event.detail;
      // Обновляем позиции планет
      angles.forEach(({ userID, angle }) => {
        const planet = this.planets.get(userID);
        if (planet) planet.setAngle(angle);
      });
      // Обновляем позиции ракет
      ships.forEach(shipData => {
        let ship = this.ships.get(shipData.userID);

        if (!ship) {
          const dockedplaneted = this.planets.get(shipData.userID)
          if (!dockedplaneted) {
            console.warn('Планета не найдена для корабля', shipData.userID);
            return;
          }
          ship = new Ship(shipData.userID, this.centerX, this.centerY, dockedplaneted.radius, this.app);
          this.ships.set(shipData.userID, ship);
        }
        
        if (shipData.isDocked) {
          ship.setAngle(shipData.planetAngle)
        } else {
          // Запоминаем предыдущую позицию для расчета направления
          const prevX = ship.container.x;
          const prevY = ship.container.y;
          
          ship.setPosition(shipData.x, shipData.y);
          
          // Устанавливаем направление (если корабль двигался)
          if (shipData.isFlying && (prevX !== shipData.x || prevY !== shipData.y)) {
            ship.setDirection(prevX, prevY, shipData.x, shipData.y);
          }
        }

        ship.setDocked(shipData.isDocked);
      });
    },

    onShipTakeoff() {
      const myShip = this.ships.get(socket.userID);
      if (myShip) {
        socket.emit("ship:takeoff", { 
          lastX: myShip.container.x, 
          lastY: myShip.container.y 
        });
      }
    },
    
    onShipFly(x, y) {
      // Летим в точку
      socket.emit("ship:fly", { x, y });
    },

    onShipRemoved(event) {
      const { userID } = event.detail;
      const ship = this.ships.get(userID);
      if (ship) {
        this.app.stage.removeChild(ship.container);
        this.ships.delete(userID);
      }
    },
    
    onPlanetAdded(event) {
      const planetData = event.detail;
      console.log('➕ Новая планета:', planetData.username);
      this.addPlanet(planetData);
    },
    
    onPlanetRemoved(event) {
      const { userID } = event.detail;
      console.log('➖ Планета удалена');
      const planet = this.planets.get(userID);
      if (planet) {
        this.app.stage.removeChild(planet.container);
        this.planets.delete(userID);
      }
    },
    
    addPlanet(data) {
      if (this.planets.has(data.userID)) return;
      const planet = new Planet(data, this.centerX, this.centerY, this.app);

      planet.onClick = (data) => {
        console.log('Обработчик клика по планете', data);
        // Например, полететь к этой планете
        this.onShipFly(planet.container.x, planet.container.y);
      };
      
      this.planets.set(data.userID, planet);
    },

    onMessageUpdate(event) {
      const { messages } = event.detail
      messages.forEach(({ id, from, to, content, fromRadius, toRadius, startAngle, targetAngle, startTime, duration, progress }) => {
        let message = this.activeMessages.get(id);
        console.log(content)
        if (!message) {
          // Первое появление — создаем письмо
          const fromPlanet = this.planets.get(from);
          const toPlanet = this.planets.get(to);
          
          if (!fromPlanet || !toPlanet) {
            console.warn('⚠️ Планеты не найдены для письма', id);
            return;
          }
          console.log(targetAngle)
          message = new Message({ id,fromRadius,toRadius,startAngle,targetAngle,startTime,duration}, this.centerX, this.centerY, this.app);
          this.activeMessages.set(id, message);
        } else {
          // Обновляем позицию существующего письма
          message.updatePosition(progress);
        }
      });
    },

    onMessageDelivered(event) {
      const { id } = event.detail;
      console.log('✅ Письмо доставлено:', id);
      
      const message = this.activeMessages.get(id);
      if (message) {
        message.destroy();
        this.activeMessages.delete(id);
      }
    },

    onMessage(content) {
      if (this.selectedUser) {
        socket.emit("private message", {
          content,
          to: this.selectedUser.userID,
        });
        // this.selectedUser.messages.push({
        //   content,
        //   fromSelf: true,
        // });
      }
    },
    onSelectUser(user) {
      this.selectedUser = user;
      user.hasNewMessages = false;
    },
  },
  created() {
    socket.on("connect", () => {
      this.users.forEach((user) => {
        if (user.self) {
          user.connected = true;
        }
      });
    });

    socket.on("disconnect", () => {
      this.users.forEach((user) => {
        if (user.self) {
          user.connected = false;
        }
      });
    });

    const initReactiveProperties = (user) => {
      user.hasNewMessages = false;
    };

    socket.on("users", (users) => {
      users.forEach((user) => {
        user.messages.forEach((message) => {
          message.fromSelf = message.from === socket.userID;
        });
        for (let i = 0; i < this.users.length; i++) {
          const existingUser = this.users[i];
          if (existingUser.userID === user.userID) {
            existingUser.connected = user.connected;
            existingUser.messages = user.messages;
            return;
          }
        }
        user.self = user.userID === socket.userID;
        initReactiveProperties(user);
        this.users.push(user);
      });
      // put the current user first, and sort by username
      this.users.sort((a, b) => {
        if (a.self) return -1;
        if (b.self) return 1;
        if (a.username < b.username) return -1;
        return a.username > b.username ? 1 : 0;
      });
    });

    socket.on("user connected", (user) => {
      for (let i = 0; i < this.users.length; i++) {
        const existingUser = this.users[i];
        if (existingUser.userID === user.userID) {
          existingUser.connected = true;
          return;
        }
      }
      initReactiveProperties(user);
      this.users.push(user);
    });

    socket.on("user disconnected", (id) => {
      for (let i = 0; i < this.users.length; i++) {
        const user = this.users[i];
        if (user.userID === id) {
          user.connected = false;
          break;
        }
      }
    });

    socket.on("private message", ({ content, from, to }) => {
      for (let i = 0; i < this.users.length; i++) {
        const user = this.users[i];
        const fromSelf = socket.userID === from;
        if (user.userID === (fromSelf ? to : from)) {
          user.messages.push({
            content,
            fromSelf,
          });
          if (user !== this.selectedUser) {
            user.hasNewMessages = true;
          }
          break;
        }
      }
    });
  },
  destroyed() {
    socket.off("connect");
    socket.off("disconnect");
    socket.off("users");
    socket.off("user connected");
    socket.off("user disconnected");
    socket.off("private message");

    window.removeEventListener('universe:init', this.onUniverseInit);
    window.removeEventListener('universe:update', this.onUniverseUpdate);
    window.removeEventListener('planet:added', this.onPlanetAdded);
    window.removeEventListener('planet:removed', this.onPlanetRemoved);

    window.removeEventListener('messages:update', this.onMessageUpdate);
    window.removeEventListener('message:delivered', this.onMessageDelivered);

    window.removeEventListener('ship:removed', this.onShipRemoved);
  },
  async mounted() {
    // // В mounted(), после инициализации Pixi
    // this.$refs.pixiContainer.addEventListener('click', (e) => {
    //   // Координаты клика относительно контейнера
    //   const rect = this.$refs.pixiContainer.getBoundingClientRect();
    //   const x = e.clientX - rect.left;
    //   const y = e.clientY - rect.top;
      
    //   console.log('Клик по контейнеру:', x, y);
      
    //   // Проверяем границы (хотя они и так в пределах контейнера)
    //   if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
    //     this.onShipFly(x, y);
    //   }
    // });

    // Инициализация Pixi
    this.app = new PIXI.Application();
    await this.app.init({ antialias: true, resizeTo: this.$refs.pixiContainer });
    this.$refs.pixiContainer.appendChild(this.app.canvas);
    
    // Центр сцены
    this.centerX = this.app.screen.width / 2;
    this.centerY = this.app.screen.height / 2;

     // Загружаем текстуры [citation:1][citation:3]
  try {
    // Можно загружать по одной
    const earthTexture = await PIXI.Assets.load('public/assets/earth.png');
    const planetTexture = await PIXI.Assets.load('public/assets/planet.png');
    
    // Сохраняем для использования в addPlanet
    this.textures = {
        earth: earthTexture,
        planet: planetTexture
      };
    } catch (error) {
      console.error('Ошибка загрузки текстур:', error);
    }

    // Создаем прозрачный интерактивный фон на всю сцену
    const background = new PIXI.Graphics();
    background.rect(0, 0, this.app.screen.width, this.app.screen.height);
    background.fill({ color: 0x000000, alpha: 0.01 }); // почти прозрачный
    background.eventMode = 'static';
    background.cursor = 'default';
    background.on('click', (event) => {
      console.log('🔥 Клик по фону!', event.global.x, event.global.y);
      
      // Проверяем границы
      if (event.global.x >= 0 && event.global.x <= this.app.screen.width &&
          event.global.y >= 0 && event.global.y <= this.app.screen.height) {
        this.onShipFly(event.global.x, event.global.y);
      }
    });
    this.app.stage.addChild(background);


    window.addEventListener('universe:init', this.onUniverseInit);
    window.addEventListener('universe:update', this.onUniverseUpdate);
    window.addEventListener('planet:added', this.onPlanetAdded);
    window.addEventListener('planet:removed', this.onPlanetRemoved);

    window.addEventListener('messages:update', this.onMessageUpdate);
    window.addEventListener('message:delivered', this.onMessageDelivered);

    window.addEventListener('ship:removed', this.onShipRemoved);

    // Для отладки: добавим Землю в центр
    const earth = new PIXI.Graphics();
    earth.circle(0, 0, 30);
    earth.fill(0x00b8d9);
    earth.x = this.centerX;
    earth.y = this.centerY;
    this.app.stage.addChild(earth);

    // this.app.stage.eventMode = 'static';
    // this.app.stage.on('click', (event) => {
    //   console.log('🔥 Событие click сработало!', event.global.x, event.global.y);
    // });
  },
};
</script>

<style scoped>
.left-panel {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 260px;
  overflow-x: hidden;
  background-color: #3f0e40;
  color: white;
  z-index: 2;
}

.pixi-container {
  position: fixed;
  left: 260px;
  top: 0;
  bottom: 0;
  right: 300px; /* ширина right-panel */
  background: black;
  z-index: 1;
  /* border: 2px solid red;  временно */
}

.right-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 300px;
  /* background-color: #f5f5f5; */
  /* border-left: 1px solid #ddd; */
  overflow-y: auto;
  z-index: 2;
}
</style>
