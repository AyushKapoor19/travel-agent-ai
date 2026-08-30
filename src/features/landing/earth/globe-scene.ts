import type { Texture } from 'three';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  MathUtils,
  Mesh,
  MeshPhongMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from 'three';

import { atmosphereMaterial } from './atmosphere-material';
import {
  BLOOM,
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CLOUD_DRIFT_PER_SECOND,
  CLOUD_DRIFT_RATIO,
  Clouds,
  DISC_OF_STAGE,
  HAZE,
  Light,
  LIGHT_DISTANCE,
  MAX_DIAMETER_PX,
  MAX_PIXEL_RATIO,
  SPHERE_SEGMENTS,
  SPIN_PER_SECOND,
  SUN_DIRECTION,
  Surface,
  TEXTURES,
  TILT_X_DEG,
  TILT_Z_DEG,
} from './constants';

/**
 * The planet, as an object that owns its own GPU resources.
 *
 * A class rather than a three-hundred-line effect, because everything here has a
 * lifetime the component does not: a renderer, a geometry, four textures and five
 * materials, all of which have to be handed back explicitly. Kept together, the
 * thing that allocates them is the thing that disposes of them, and `dispose()`
 * is one call the component makes on the way out instead of a list it maintains.
 *
 * React is deliberately absent. Nothing here re-renders; the component drives it
 * frame by frame.
 */
export class GlobeScene {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera;

  /** Carries the tilt. The atmosphere shells hang off this, unrotated by the spin. */
  private readonly pivot = new Group();
  /** Turns. Holds the surface and the clouds. */
  private readonly spin = new Group();

  private readonly geometry: SphereGeometry;
  private readonly surface: Mesh;
  private readonly clouds: Mesh;
  private readonly haze: Mesh;
  private readonly bloom: Mesh;

  private readonly textures: Texture[] = [];

  /** The planet's rendered diameter in CSS pixels. Also the stirring ruler. */
  private renderedDiameter = 0;

  /**
   * @throws When the canvas cannot give a WebGL context. Use `create` instead of
   * calling this directly.
   */
  private constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearAlpha(0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));

    /**
     * Orthographic, because that is how a planet photographed from a long way
     * off actually projects: a true circle, with no perspective flare.
     */
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_FAR);
    this.camera.position.z = CAMERA_DISTANCE;

    this.pivot.rotation.z = MathUtils.degToRad(TILT_Z_DEG);
    this.pivot.rotation.x = MathUtils.degToRad(TILT_X_DEG);
    this.scene.add(this.pivot);
    this.pivot.add(this.spin);

    const light = new DirectionalLight(Light.SUN_COLOR, Light.SUN_INTENSITY);
    light.position
      .set(...SUN_DIRECTION)
      .normalize()
      .multiplyScalar(LIGHT_DISTANCE);
    this.scene.add(light);
    this.scene.add(new AmbientLight(Light.AMBIENT_COLOR, Light.AMBIENT_INTENSITY));

    this.geometry = new SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS);

    this.surface = new Mesh(this.geometry, new MeshPhongMaterial({ color: Surface.BASE_COLOR }));
    this.spin.add(this.surface);

    this.clouds = new Mesh(
      this.geometry,
      new MeshPhongMaterial({ transparent: true, depthWrite: false, opacity: 0 }),
    );
    this.clouds.scale.setScalar(Clouds.SCALE);
    this.spin.add(this.clouds);

    this.haze = new Mesh(this.geometry, atmosphereMaterial(HAZE));
    this.haze.scale.setScalar(HAZE.scale);
    this.pivot.add(this.haze);

    this.bloom = new Mesh(this.geometry, atmosphereMaterial(BLOOM));
    this.bloom.scale.setScalar(BLOOM.scale);
    this.pivot.add(this.bloom);
  }

  /** Null when the browser has no WebGL, in which case the placeholder stays put. */
  static create(canvas: HTMLCanvasElement): GlobeScene | null {
    try {
      return new GlobeScene(canvas);
    } catch {
      return null;
    }
  }

  get diameter(): number {
    return this.renderedDiameter;
  }

  /** Reads the canvas's client box and re-frames the planet inside it. */
  measure(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this.renderer.setSize(width, height, false);

    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();

    // Height drives the disc; width only has to hold the bloom, which fades to
    // nothing at its own edge and so costs almost no clearance.
    this.renderedDiameter = Math.min(height * DISC_OF_STAGE, width / BLOOM.scale, MAX_DIAMETER_PX);

    this.pivot.scale.setScalar(this.renderedDiameter / 2);
    this.pivot.position.set(0, 0, 0);
  }

  /**
   * Advances the rotation.
   *
   * @param boost Extra radians per second on top of the ambient drift, signed.
   * The clouds take their share of it, so a stir moves the whole planet rather
   * than sliding the ground out from under the weather.
   */
  advance(elapsedSeconds: number, boost: number): void {
    this.spin.rotation.y += elapsedSeconds * (SPIN_PER_SECOND + boost);
    this.clouds.rotation.y += elapsedSeconds * (CLOUD_DRIFT_PER_SECOND + boost * CLOUD_DRIFT_RATIO);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Loads the imagery and applies it.
   *
   * @throws When any texture fails, which leaves the base-coloured sphere in
   * place — the caller keeps its placeholder rather than showing that.
   */
  async loadTextures(): Promise<void> {
    const loader = new TextureLoader();
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    /** Anisotropy is what keeps the texture sharp where it rakes away at the limb. */
    const load = (url: string, isColor: boolean) =>
      new Promise<Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.anisotropy = anisotropy;
            if (isColor) texture.colorSpace = SRGBColorSpace;
            this.textures.push(texture);
            resolve(texture);
          },
          undefined,
          reject,
        );
      });

    const [day, relief, ocean, cloud] = await Promise.all([
      load(TEXTURES.day, true),
      load(TEXTURES.relief, false),
      load(TEXTURES.ocean, false),
      load(TEXTURES.clouds, true),
    ]);

    const surface = this.surface.material as MeshPhongMaterial;
    surface.map = day;
    surface.bumpMap = relief;
    surface.bumpScale = Surface.BUMP_SCALE;
    surface.specularMap = ocean;
    surface.specular = new Color(Surface.SPECULAR_COLOR);
    surface.shininess = Surface.SHININESS;
    surface.color = new Color(Surface.LIT_COLOR);
    surface.needsUpdate = true;

    const clouds = this.clouds.material as MeshPhongMaterial;
    clouds.map = cloud;
    clouds.opacity = Clouds.OPACITY;
    clouds.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.textures.forEach((texture) => texture.dispose());

    for (const mesh of [this.surface, this.clouds, this.haze, this.bloom]) {
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }

    this.renderer.dispose();
  }
}
