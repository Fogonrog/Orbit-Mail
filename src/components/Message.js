import * as PIXI from 'pixi.js';

export default class Message {
  constructor(data, centerX, centerY, app) {
    this.id = data.id;
    this.fromRadius = data.fromRadius;
    this.toRadius = data.toRadius;
    this.startAngle = data.startAngle;
    this.targetAngle = data.targetAngle;
    this.startTime = data.startTime;
    this.duration = data.duration;
    this.centerX = centerX;
    this.centerY = centerY;
    
    // Белый кружочек
    this.graphics = new PIXI.Graphics();
    this.graphics.circle(0, 0, 5);
    this.graphics.fill(0xffffff);
    
    app.stage.addChild(this.graphics);
  }
  
  updatePosition(progress) {
    
    // Интерполяция радиуса и угла (ТВОЯ ФОРМУЛА!)
    const currentRadius = this.fromRadius + (this.toRadius - this.fromRadius) * progress;
    const currentAngle = this.startAngle + (this.targetAngle - this.startAngle) * progress;
    
    // Перевод полярных координат в декартовы
    this.graphics.x = this.centerX + Math.cos(currentAngle) * currentRadius;
    this.graphics.y = this.centerY + Math.sin(currentAngle) * currentRadius;

    // Если долетело
    if (progress >= 1) {
      this.graphics.visible = false;
    }
  }
  
  destroy() {
    this.graphics.destroy();
  }
}