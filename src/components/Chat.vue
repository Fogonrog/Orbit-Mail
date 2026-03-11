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
      centerY: 0
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
      const { angles } = event.detail;
      // Обновляем позиции планет
      angles.forEach(({ userID, angle }) => {
        // console.log(angle)
        const planet = this.planets.get(userID);
        if (planet) planet.setAngle(angle);
      });
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
      this.planets.set(data.userID, planet);
    },

    onMessage(content) {
      if (this.selectedUser) {
        socket.emit("private message", {
          content,
          to: this.selectedUser.userID,
        });
        this.selectedUser.messages.push({
          content,
          fromSelf: true,
        });
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
  },
  async mounted() {
    // Инициализация Pixi
    this.app = new PIXI.Application();
    await this.app.init({ antialias: true, resizeTo: this.$refs.pixiContainer });
    this.$refs.pixiContainer.appendChild(this.app.canvas);
    
    // Центр сцены
    this.centerX = this.app.screen.width / 2;
    this.centerY = this.app.screen.height / 2;

    window.addEventListener('universe:init', this.onUniverseInit);
    window.addEventListener('universe:update', this.onUniverseUpdate);
    window.addEventListener('planet:added', this.onPlanetAdded);
    window.addEventListener('planet:removed', this.onPlanetRemoved);

    // Для отладки: добавим Землю в центр
    const earth = new PIXI.Graphics();
    earth.circle(0, 0, 30);
    earth.fill(0x00b8d9);
    earth.x = this.centerX;
    earth.y = this.centerY;
    this.app.stage.addChild(earth);
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
