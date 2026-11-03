import assert from "node:assert/strict";
import {
  normalizarCifra,
  transporSemitons,
  transporTextoCifra,
} from "../src/utils/cifraUtils.js";

function runTests() {
  console.log("Executando testes unitários de cifraUtils...");

  // 1. Teste de Transposição Unitária
  assert.equal(transporSemitons("C", 2), "D", "C + 2 deve ser D");
  assert.equal(transporSemitons("E", 3), "G", "E + 3 deve ser G");
  assert.equal(transporSemitons("Bb", -1), "A", "Bb - 1 deve ser A");
  assert.equal(transporSemitons("F#m7", 3), "Am7", "F#m7 + 3 deve ser Am7");
  assert.equal(transporSemitons("G/B", 2), "A/C#", "G/B + 2 deve ser A/C#");
  assert.equal(transporSemitons("Cmaj7", 2), "Dmaj7", "Cmaj7 + 2 deve ser Dmaj7");

  // Ciclo completo de 12 semitons
  let chord = "F#m7(b5)/C#";
  for (let i = 0; i < 12; i++) {
    chord = transporSemitons(chord, 1);
  }
  assert.equal(chord, "F#m7(b5)/C#", "Ciclo de 12 semitons deve retornar ao original");
  console.log("✓ Testes de transposição de acordes passaram!");

  // 2. Teste de Normalização: Cifra já em [C]Letra
  const inlineInput = "[C]Parece até conto de [G]fadas\n[Am]Mas assim [F]aconteceu";
  const inlineOutput = normalizarCifra(inlineInput);
  assert.equal(inlineOutput, inlineInput, "Cifra já em formato inline deve ser preservada");
  console.log("✓ Teste de cifra inline preservada passou!");

  // 3. Teste de Normalização: Intro só de acordes
  const introInput = "[Intro] Em7  A  D  G";
  const introOutput = normalizarCifra(introInput);
  assert(introOutput.includes("[Intro]"), "Deve conter [Intro]");
  assert(introOutput.includes("[Em7] [A] [D] [G]"), "Deve formatar acordes da intro com colchetes");
  console.log("✓ Teste de intro de acordes passou!");

  // 4. Teste de Normalização: Tablatura
  const tabInput = `[Intro]\nE|--------------------------|\nB|---10~--------14~---------|\nG|--------9/11-------11/14--|`;
  const tabOutput = normalizarCifra(tabInput);
  assert(tabOutput.includes("E|--------------------------|"), "Tablatura deve ser mantida intacta");
  assert(tabOutput.includes("B|---10~--------14~---------|"), "Tablatura corda B intacta");
  console.log("✓ Teste de tablatura intacta passou!");

  // 5. Teste de Normalização: Cifra estilo Cifra Club ("A lua me traiu")
  const cifraClubReal = `Tom: E
[Intro] E  A  D  B7

E
  Parece até conto de fadas
A
  Mas assim aconteceu
B7
  Éramos dois apaixonados
E
  Julieta e Romeu`;

  const normalized = normalizarCifra(cifraClubReal);
  assert(!normalized.includes("Tom: E"), "Ruído 'Tom: E' deve ser removido");
  assert(normalized.includes("[E]"), "Deve conter [E] alinhado");
  assert(normalized.includes("[A]"), "Deve conter [A] alinhado");
  assert(normalized.includes("[B7]"), "Deve conter [B7] alinhado");
  assert(normalized.includes("[Intro]"), "Deve conter marcador [Intro]");
  console.log("✓ Teste de cifra real estilo Cifra Club passou!");

  // 6. Teste de Transposição em texto de cifra completo
  const songText = `[Intro] [E] [A]\n[E]Parece até conto de fadas\n[A]Mas assim aconteceu [B7]Julieta e Romeu`;
  const transposedSong = transporTextoCifra(songText, 1);
  assert(transposedSong.includes("[F]"), "E + 1 deve virar F");
  assert(transposedSong.includes("[Bb]"), "A + 1 deve virar Bb");
  assert(transposedSong.includes("[C7]"), "B7 + 1 deve virar C7");
  assert(transposedSong.includes("[Intro]"), "[Intro] não deve ser transposto");
  console.log("✓ Teste de transposição em texto completo passou!");

  console.log("\nTodos os testes unitários de cifraUtils foram executados com SUCESSO! 🎉");
}

runTests();
