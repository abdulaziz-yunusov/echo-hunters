import { GAME } from '@/config/game';
import type { Player } from '../entities/player';
import type { SimContext } from '../gameState';
import type { PlayerInput } from '../playerInput';
import { moveCircle } from '../world/collision';

/**
 * Move the player from input: walk or sneak, slide along walls, leave
 * footsteps, and make a noise when walking into a wall (unless silent).
 */
export function updatePlayerMovement(
  ctx: SimContext,
  player: Player,
  input: PlayerInput,
  dt: number,
): void {
  const cfg = GAME.player;
  const sneaking = input.sneak;
  const speed = sneaking ? cfg.sneakSpeed : cfg.speed;
  // Sneaking is silent but slow; Silent Boots are silent at any speed.
  const silent = sneaking || player.silentTime > 0;

  let mx = input.moveX;
  let my = input.moveY;
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  if (length > 0.1) {
    player.facingX = input.moveX / length;
    player.facingY = input.moveY / length;
  }
  // Knockback from a hit adds to the walk and fades out quickly.
  const wantX = mx * speed + player.knockVx;
  const wantY = my * speed + player.knockVy;
  const fade = Math.exp(-dt / cfg.knockbackDecay);
  player.knockVx *= fade;
  player.knockVy *= fade;
  if (Math.hypot(player.knockVx, player.knockVy) < 1) player.knockVx = player.knockVy = 0;

  const moved = moveCircle(
    ctx.state.layout.tiles,
    player.x,
    player.y,
    player.radius,
    wantX * dt,
    wantY * dt,
  );
  const dx = moved.x - player.x;
  const dy = moved.y - player.y;
  player.x = moved.x;
  player.y = moved.y;
  player.vx = dx / dt;
  player.vy = dy / dt;
  player.sneaking = sneaking;

  // Footsteps by distance walked.
  if (!silent) {
    player.stride += Math.hypot(dx, dy);
    const strideLength = cfg.speed * cfg.footstepInterval;
    while (player.stride >= strideLength) {
      player.stride -= strideLength;
      ctx.emitSound('step', player.x, player.y, player.id);
    }
  }

  // Wall bump: only on first contact, only when hitting the wall head-on hard enough.
  player.bumpCooldown = Math.max(0, player.bumpCooldown - dt);
  if (moved.hit && !player.touchingWall && player.bumpCooldown === 0 && !silent) {
    const impactSpeed = -(wantX * moved.nx + wantY * moved.ny);
    if (impactSpeed >= GAME.wallBump.minImpactSpeed) {
      // At the contact point, 1 px off the wall face (a sound needs open floor to start in).
      const reach = player.radius - 1;
      ctx.emitSound(
        'wallBump',
        player.x - moved.nx * reach,
        player.y - moved.ny * reach,
        player.id,
      );
      player.bumpCooldown = GAME.wallBump.cooldown;
    }
  }
  player.touchingWall = moved.hit;
}
