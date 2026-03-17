// Ship.js
import * as PIXI from 'pixi.js';

export default class Ship {
  constructor(userID, centerX, centerY, planetRadius, app) {
    this.userID = userID;
    this.centerX = centerX;
    this.centerY = centerY;
    this.planetRadius = planetRadius;
    console.log('Новый корабль')
    console.log(userID, centerX, centerY, planetRadius, app)

    // Простой треугольник для ракеты
    this.graphics = new PIXI.Graphics();
    this.graphics.poly([-8, -6, 8, 0, -8, 6]);
    this.graphics.fill(0xffaa00);
    
    this.container = new PIXI.Container();
    this.container.addChild(this.graphics);
    
    app.stage.addChild(this.container);
  }
  
  setPosition(x, y) {
    // this.container.setAngle(-1.57)
    this.container.x = x;
    this.container.y = y
  }

  setAngle(angle) {
    this.container.x = this.centerX + Math.cos(angle) * this.planetRadius;
    this.container.y = this.centerY + Math.sin(angle) * this.planetRadius;
  }
  
  setDocked(isDocked) {
    // Меняем цвет если припаркована
    this.graphics.tint = isDocked ? 0xffff00 : 0xffaa00;
  }

  // Новый метод для поворота в направлении движения
  setDirection(fromX, fromY, toX, toY) {
    // Вычисляем вектор движения
    const dx = toX - fromX;
    const dy = toY - fromY;
    
    // Вычисляем угол в радианах (0 радиан = направление вправо)
    let angle = Math.atan2(dy, dx);
    
    // Поворачиваем контейнер
    this.container.rotation = angle;
  }
}