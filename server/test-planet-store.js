const Redis = require("ioredis");
const redisClient = new Redis();
const { RedisPlanetStore } = require("./planetStore");

async function test() {
  console.log("🚀 Тестируем PlanetStore...");
  
  const planetStore = new RedisPlanetStore(redisClient);
  
  // 1. Очистим всё для чистого теста
  console.log("🧹 Очищаем старые данные...");
  const oldPlanets = await planetStore.findAllPlanets();
  for (const p of oldPlanets) {
    await planetStore.removePlanet(p.userID);
  }
  
  // 2. Сохраняем несколько планет
  console.log("📝 Сохраняем планету для Димы...");
  const planet1 = await planetStore.savePlanet("user123", {
    username: "Дима"
  });
  console.log("✅ Планета Димы:", planet1);
  
  console.log("📝 Сохраняем планету для Анны...");
  const planet2 = await planetStore.savePlanet("user456", {
    username: "Анна"
  });
  console.log("✅ Планета Анны:", planet2);
  
  // 3. Проверяем, что орбиты разные
  console.log("📏 Проверка орбит:");
  console.log("- Радиус Димы:", planet1.orbitRadius);
  console.log("- Радиус Анны:", planet2.orbitRadius);
  
  // 4. Получаем все планеты
  console.log("🔍 Получаем все планеты...");
  const allPlanets = await planetStore.findAllPlanets();
  console.log("📊 Все планеты в Redis:", allPlanets);
  
  // 5. Ищем конкретную планету
  console.log("🔎 Ищем планету Димы...");
  const found = await planetStore.findPlanet("user123");
  console.log("✅ Найдена:", found);
  
  // 6. Удаляем одну планету
  console.log("🗑️ Удаляем планету Анны...");
  await planetStore.removePlanet("user456");
  
  // 7. Проверяем, что осталось
  const remaining = await planetStore.findAllPlanets();
  console.log("📊 Осталось в Redis:", remaining);
  
  console.log("🎉 Тест завершен!");
  process.exit(0);
}

test().catch(err => {
  console.error("❌ Ошибка:", err);
  process.exit(1);
});
