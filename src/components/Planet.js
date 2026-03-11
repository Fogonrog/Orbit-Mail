// src/components/Planet.js
import * as PIXI from 'pixi.js';

export default class Planet {
  constructor(data, centerX, centerY, app) {
    this.id = data.userID;
    this.username = data.username;
    this.radius = data.orbitRadius || 150;
    this.speed = data.orbitSpeed || 0.005;
    this.startAngle = data.startAngle || 0;
    this.color = data.color || 0xffaa00;
    this.centerX = centerX;
    this.centerY = centerY;
    
    // Создаем графику
    this.graphics = new PIXI.Graphics();
    this.draw();
    
    // Текст с именем
    this.text = new PIXI.Text({
      text: this.username,
      style: { fontSize: 14, fill: 0xffffff }
    });
    this.text.anchor.set(0.5);
    this.text.y = -25;
    
    // Контейнер для всего
    this.container = new PIXI.Container();
    this.container.addChild(this.graphics);
    this.container.addChild(this.text);
    
    // Добавляем на сцену
    app.stage.addChild(this.container);
    
    // Начальная позиция
    this.setAngle(this.startAngle);
  }
  
  draw() {
    this.graphics.clear();
    this.graphics.circle(0, 0, 15);
    this.graphics.fill(this.color);
    
    // Обводка для красоты
    this.graphics.stroke({ width: 2, color: 0xffffff });
  }
  
  setAngle(angle) {
    this.container.x = this.centerX + Math.cos(angle) * this.radius;
    this.container.y = this.centerY + Math.sin(angle) * this.radius;
  }
  
  setColor(color) {
    this.color = color;
    this.draw();
  }
  
  setRadius(radius) {
    this.radius = radius;
  }
}
