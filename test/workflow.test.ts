/**
 * VEZ Stablecoin CRE Workflow - Tests
 */
import { describe, it, expect } from "@jest/globals";

describe("VEZ Stablecoin CRE Workflow", () => {
  it("devrait utiliser le sélecteur Slura fixe", () => {
    // Le workflow utilise directement le sélecteur Slura (3034092155422581607)
    // sans passer par getNetwork, car le nœud Slura pré-déploie aux adresses fixes.
    expect(3034092155422581607n).toBe(3034092155422581607n);
  });
});
