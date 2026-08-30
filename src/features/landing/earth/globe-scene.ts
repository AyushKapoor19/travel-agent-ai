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
  private readonly _renderer: WebGLRenderer;
  private readonly _scene = new Scene();
  private readonly _camera: OrthographicCamera;

  /** Carries the tilt. The atmosphere shells hang off this, unrotated by the spin. */
  private readonly _pivot = new Group();
  /** Turns. Holds the surface and the clouds. */
  private readonly _spin = new Group();

  private readonly _geometry: SphereGeometry;
  private readonly _surface: Mesh;
  private readonly _clouds: Mesh;
  private readonly _haze: Mesh;
  private readonly _bloom: Mesh;

  private readonly _textures: Texture[] = [];

  /** The planet's rendered diameter in CSS pixels. Also the stirring ruler. */
  private _renderedDiameter = 0;

  /**
   * @throws When the canvas cannot give a WebGL context. Use `create` instead of
   * calling this directly.
   */
  private constructor(private readonly _canvas: HTMLCanvasElement) {
    this._renderer = new WebGLRenderer({ canvas: _canvas, alpha: true, antialias: true });
    this._renderer.setClearAlpha(0);
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));

    /**
     * Orthographic, because that is how a planet photographed from a long way
     * off actually projects: a true circle, with no perspective flare.
     */
    this._camera = new OrthographicCamera(-1, 1, 1, -1, 1, CAMERA_FAR);
    this._camera.position.z = CAMERA_DISTANCE;

    this._pivot.rotation.z = MathUtils.degToRad(TILT_Z_DEG);
    this._pivot.rotation.x = MathUtils.degToRad(TILT_X_DEG);
    this._scene.add(this._pivot);
    this._pivot.add(this._spin);

    const light = new DirectionalLight(Light.SUN_COLOR, Light.SUN_INTENSITY);
    light.position
      .set(...SUN_DIRECTION)
      .normalize()
      .multiplyScalar(LIGHT_DISTANCE);
    this._scene.add(light);
    this._scene.add(new AmbientLight(Light.AMBIENT_COLOR, Light.AMBIENT_INTENSITY));

    this._geometry = new SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS);

    this._surface = new Mesh(this._geometry, new MeshPhongMaterial({ color: Surface.BASE_COLOR }));
    this._spin.add(this._surface);

    this._clouds = new Mesh(
      this._geometry,
      new MeshPhongMaterial({ transparent: true, depthWrite: false, opacity: 0 }),
    );
    this._clouds.scale.setScalar(Clouds.SCALE);
    this._spin.add(this._clouds);

    this._haze = new Mesh(this._geometry, atmosphereMaterial(HAZE));
    this._haze.scale.setScalar(HAZE.scale);
    this._pivot.add(this._haze);

    this._bloom = new Mesh(this._geometry, atmosphereMaterial(BLOOM));
    this._bloom.scale.setScalar(BLOOM.scale);
    this._pivot.add(this._bloom);
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
    return this._renderedDiameter;
  }

  /** Reads the canvas's client box and re-frames the planet inside it. */
  measure(): void {
    const width = this._canvas.clientWidth;
    const height = this._canvas.clientHeight;
    if (width === 0 || height === 0) return;

    this._renderer.setSize(width, height, false);

    this._camera.left = -width / 2;
    this._camera.right = width / 2;
    this._camera.top = height / 2;
    this._camera.bottom = -height / 2;
    this._camera.updateProjectionMatrix();

    // Height drives the disc; width only has to hold the bloom, which fades to
    // nothing at its own edge and so costs almost no clearance.
    this._renderedDiameter = Math.min(height * DISC_OF_STAGE, width / BLOOM.scale, MAX_DIAMETER_PX);

    this._pivot.scale.setScalar(this._renderedDiameter / 2);
    this._pivot.position.set(0, 0, 0);
  }

  /**
   * Advances the rotation.
   *
   * @param boost Extra radians per second on top of the ambient drift, signed.
   * The clouds take their share of it, so a stir moves the whole planet rather
   * than sliding the ground out from under the weather.
   */
  advance(elapsedSeconds: number, boost: number): void {
    this._spin.rotation.y += elapsedSeconds * (SPIN_PER_SECOND + boost);
    this._clouds.rotation.y +=
      elapsedSeconds * (CLOUD_DRIFT_PER_SECOND + boost * CLOUD_DRIFT_RATIO);
  }

  render(): void {
    this._renderer.render(this._scene, this._camera);
  }

  /**
   * Loads the imagery and applies it.
   *
   * @throws When any texture fails, which leaves the base-coloured sphere in
   * place — the caller keeps its placeholder rather than showing that.
   */
  async loadTextures(): Promise<void> {
    const loader = new TextureLoader();
    const anisotropy = this._renderer.capabilities.getMaxAnisotropy();

    /** Anisotropy is what keeps the texture sharp where it rakes away at the limb. */
    const load = (url: string, isColor: boolean) =>
      new Promise<Texture>((resolve, reject) => {
        loader.load(
          url,
          (texture) => {
            texture.anisotropy = anisotropy;
            if (isColor) texture.colorSpace = SRGBColorSpace;
            this._textures.push(texture);
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

    const surface = this._surface.material as MeshPhongMaterial;
    surface.map = day;
    surface.bumpMap = relief;
    surface.bumpScale = Surface.BUMP_SCALE;
    surface.specularMap = ocean;
    surface.specular = new Color(Surface.SPECULAR_COLOR);
    surface.shininess = Surface.SHININESS;
    surface.color = new Color(Surface.LIT_COLOR);
    surface.needsUpdate = true;

    const clouds = this._clouds.material as MeshPhongMaterial;
    clouds.map = cloud;
    clouds.opacity = Clouds.OPACITY;
    clouds.needsUpdate = true;
  }

  dispose(): void {
    this._geometry.dispose();
    this._textures.forEach((texture) => texture.dispose());

    for (const mesh of [this._surface, this._clouds, this._haze, this._bloom]) {
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    }

    this._renderer.dispose();
  }
}
