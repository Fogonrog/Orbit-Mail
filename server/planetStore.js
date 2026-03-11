/* abstract */ class PlanetStore {
  findPlanet(id) {}
  savePlanet(id, planet) {}
  findAllPlanets() {}
}

class InMemoryPlanetStore extends PlanetStore {
  constructor() {
    super();
    this.planets = new Map();
  }

  findPlanet(id) {
    return this.planets.get(id);
  }

  savePlanet(id, planet) {
    this.sessions.set(id, planet);
  }

  findAllPlanets() {
    return [...this.sessions.values()];
  }
}

const PLANET_TTL = 24 * 60 * 60;
// Функция преобразования из массива Redis в объект
const mapPlanet = ([userID, username, orbitRadius, orbitSpeed, startAngle, color, createdAt]) => {
  if (!userID) return undefined;
  return {
    userID,
    username,
    orbitRadius: parseFloat(orbitRadius),
    orbitSpeed: parseFloat(orbitSpeed),
    startAngle: parseFloat(startAngle),
    color: parseInt(color),
    createdAt: parseInt(createdAt)
  };
};

class RedisPlanetStore extends PlanetStore {
  constructor(redisClient) {
    super();
    this.redisClient = redisClient;
  }

  // Найти одну планету по userID
  async findPlanet(id) {
    const result = await this.redisClient
      .hmget(`planet:${id}`, "userID", "username", "orbitRadius", "orbitSpeed", "startAngle", "color", "createdAt");
    
    // Redis возвращает массив, где отсутствующие значения = null
    if (!result[0]) return null; // нет такой планеты
    
    return mapPlanet(result);
  }

  // Сохранить планету
  async savePlanet(id, planetData) {
    // Получаем список всех планет для расчета орбиты
    const planets = await this.findAllPlanets();
    
    // Если не передан радиус, вычисляем на основе количества планет
    const orbitRadius = planetData.orbitRadius || (150 + planets.length * 50);
    const orbitSpeed = planetData.orbitSpeed || (0.2 / (2 ** planets.length));
    const startAngle = planetData.startAngle || 0;
    const color = planetData.color || Math.floor(Math.random() * 0xFFFFFF);
    const createdAt = planetData.createdAt || Date.now();

    console.log('💾 Сохраняю планету:', {
      id,
      username: planetData.username,
      orbitRadius,
      orbitSpeed,
      startAngle,
      color,
      createdAt
    });
    
    await this.redisClient
      .multi()
      .hset(
        `planet:${id}`,
        "userID", planetData.userID || id,
        "username", planetData.username,
        "orbitRadius", orbitRadius.toString(),
        "orbitSpeed", orbitSpeed.toString(),
        "startAngle", startAngle.toString(),
        "color", color.toString(),
        "createdAt", createdAt.toString()
      )
      .expire(`planet:${id}`, PLANET_TTL)
      .exec();
      
    return {
      userID: id,
      username: planetData.username,
      orbitRadius,
      orbitSpeed,
      startAngle,
      color,
      createdAt
    };
  }


  // Получить все планеты
  async findAllPlanets() {
    const keys = new Set();
    let nextIndex = 0;
    
    // Сканируем все ключи, начинающиеся с "planet:"
    do {
      const [nextIndexAsStr, results] = await this.redisClient.scan(
        nextIndex,
        "MATCH", "planet:*",
        "COUNT", "100"
      );
      nextIndex = parseInt(nextIndexAsStr, 10);
      results.forEach((s) => keys.add(s));
    } while (nextIndex !== 0);
    
    if (keys.size === 0) return [];
    
    // Собираем команды для получения данных
    const commands = [];
    keys.forEach((key) => {
      commands.push(["hmget", key, "userID", "username", "orbitRadius", "orbitSpeed", "startAngle", "color", "createdAt"]);
    });
    
    // Выполняем все запросы
    const results = await this.redisClient.multi(commands).exec();
    
    // Преобразуем результаты
    return results
      .map(([err, session]) => {
        if (err) return undefined;
        return mapPlanet(session);
      })
      .filter(p => p !== undefined);
  }

  // Удалить планету
  async removePlanet(id) {
    await this.redisClient.del(`planet:${id}`);
  }
}
module.exports = {
  InMemoryPlanetStore,
  RedisPlanetStore,
};
