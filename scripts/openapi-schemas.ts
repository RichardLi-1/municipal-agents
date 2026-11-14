// Derive the OpenAPI component schemas from shared/types.ts with the TypeScript type
// checker, so the API description can't drift from the types the code uses:
//   node scripts/openapi-schemas.ts          writes server/openapi-schemas.json
//   node scripts/openapi-schemas.ts --check  exits 1 if the file is out of date
// server/openapi.test.ts runs the check too. TypeScript is a dev dependency; the
// running server only reads the generated JSON.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

type Schema = Record<string, unknown>;

const root = path.resolve(import.meta.dirname, "..");
const TYPES = path.join(root, "shared", "types.ts");
export const OUT = path.join(root, "server", "openapi-schemas.json");

export function generateSchemas(): Record<string, Schema> {
  const program = ts.createProgram([TYPES], {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowImportingTsExtensions: true,
    noEmit: true,
    types: ["geojson"],
    typeRoots: [path.join(root, "node_modules", "@types")],
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(TYPES);
  if (!sf) throw new Error(`can't read ${TYPES}`);
  const text = sf.getFullText();

  const exported = new Set<string>();
  for (const st of sf.statements) {
    if ((ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      exported.add(st.name.text);
    }
  }

  const fromTypes = (decls: ts.Declaration[] | undefined) => !!decls?.some((d) => d.getSourceFile() === sf);
  const fromGeoJson = (decls: ts.Declaration[] | undefined) => !!decls?.some((d) => /[\\/]@types[\\/]geojson[\\/]/.test(d.getSourceFile().fileName));

  /** A short description from a JSDoc comment or a trailing `// ...` comment. */
  function describe(sym: ts.Symbol): string | undefined {
    const doc = ts.displayPartsToString(sym.getDocumentationComment(checker)).trim();
    const decl = sym.declarations?.[0];
    let trailing = "";
    if (decl && decl.getSourceFile() === sf) {
      const ranges = ts.getTrailingCommentRanges(text, decl.end) ?? [];
      trailing = ranges
        .map((r) => text.slice(r.pos, r.end))
        .filter((c) => c.startsWith("//"))
        .map((c) => c.replace(/^\/\/\s?/, "").trim())
        .join(" ");
    }
    const all = [doc, trailing].filter(Boolean).join(" ");
    return all || undefined;
  }

  function toSchema(type: ts.Type, self?: string, typeNode?: ts.TypeNode): Schema {
    if (typeNode && ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName) && typeNode.typeName.text === "IsoDate") {
      return { $ref: "#/components/schemas/IsoDate" };
    }
    // A named type from shared/types.ts becomes a reference (except while defining it).
    const alias = type.aliasSymbol;
    if (alias && exported.has(alias.name) && alias.name !== self && fromTypes(alias.declarations)) return { $ref: `#/components/schemas/${alias.name}` };
    const sym = type.getSymbol();
    if (sym && exported.has(sym.name) && sym.name !== self && fromTypes(sym.declarations) && type.isClassOrInterface()) {
      return { $ref: `#/components/schemas/${sym.name}` };
    }
    if (fromGeoJson(alias?.declarations) || fromGeoJson(sym?.declarations)) {
      return { type: "object", description: `GeoJSON ${(alias ?? sym)!.name} (RFC 7946, WGS84)` };
    }

    const f = type.flags;
    if (f & ts.TypeFlags.Any || f & ts.TypeFlags.Unknown) return {};
    if (f & ts.TypeFlags.StringLiteral) return { type: "string", const: (type as ts.StringLiteralType).value };
    if (f & ts.TypeFlags.NumberLiteral) return { type: "number", const: (type as ts.NumberLiteralType).value };
    if (f & ts.TypeFlags.BooleanLiteral) return { type: "boolean", const: checker.typeToString(type) === "true" };
    if (f & ts.TypeFlags.String) return { type: "string" };
    if (f & ts.TypeFlags.Number) return { type: "number" };
    if (f & ts.TypeFlags.Boolean) return { type: "boolean" };
    if (f & ts.TypeFlags.Null) return { type: "null" };

    if (type.isUnion()) {
      const parts = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
      if (parts.length === 1) return toSchema(parts[0], self);
      if (parts.every((t) => t.flags & ts.TypeFlags.StringLiteral)) {
        return { type: "string", enum: parts.map((t) => (t as ts.StringLiteralType).value) };
      }
      if (parts.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) return { type: "boolean" };
      const nonNull = parts.filter((t) => !(t.flags & ts.TypeFlags.Null));
      const schemas = nonNull.map((t) => toSchema(t, self));
      if (nonNull.length < parts.length) schemas.push({ type: "null" });
      // Discriminated unions (AgentEvent) read best as oneOf.
      return { oneOf: schemas };
    }

    if (checker.isTupleType(type)) {
      const items = checker.getTypeArguments(type as ts.TypeReference).map((t) => toSchema(t, self));
      return { type: "array", prefixItems: items, minItems: items.length, maxItems: items.length };
    }
    if (checker.isArrayType(type)) {
      const [item] = checker.getTypeArguments(type as ts.TypeReference);
      return { type: "array", items: toSchema(item, self) };
    }

    if (f & ts.TypeFlags.Object) {
      const out: Schema = { type: "object" };
      const props: Record<string, Schema> = {};
      const required: string[] = [];
      for (const p of checker.getPropertiesOfType(type)) {
        const decl = p.valueDeclaration ?? p.declarations?.[0];
        const pt = decl ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getTypeOfSymbol(p);
        const node = decl && (ts.isPropertySignature(decl) || ts.isPropertyDeclaration(decl)) ? decl.type : undefined;
        const s = toSchema(pt, self, node);
        const d = describe(p);
        props[p.name] = d && !s.$ref ? { ...s, description: d } : d ? { allOf: [s], description: d } : s;
        if (!(p.flags & ts.SymbolFlags.Optional)) required.push(p.name);
      }
      if (Object.keys(props).length) out.properties = props;
      if (required.length) out.required = required;
      const index = checker.getIndexInfosOfType(type)[0];
      if (index) out.additionalProperties = toSchema(index.type, self);
      return out;
    }
    return {};
  }

  const schemas: Record<string, Schema> = {
    IsoDate: { type: "string", description: "ISO 8601 date (2026-11-25) or date-time with offset (2026-11-25T19:00:00-05:00)." },
  };
  for (const st of sf.statements) {
    if (!(ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) || !exported.has(st.name.text)) continue;
    const name = st.name.text;
    if (name === "IsoDate") continue;
    const sym = checker.getSymbolAtLocation(st.name)!;
    const s = toSchema(checker.getDeclaredTypeOfSymbol(sym), name);
    const d = describe(sym);
    schemas[name] = d ? { ...s, description: d } : s;
  }
  return schemas;
}

export function render(schemas: Record<string, Schema>): string {
  return JSON.stringify(schemas, null, 2) + "\n";
}

if (import.meta.main) {
  const next = render(generateSchemas());
  if (process.argv.includes("--check")) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    if (cur !== next) {
      console.error("server/openapi-schemas.json is out of date: run node scripts/openapi-schemas.ts");
      process.exit(1);
    }
    console.log("server/openapi-schemas.json is up to date");
  } else {
    fs.writeFileSync(OUT, next);
    console.log(`wrote ${path.relative(root, OUT)} (${Object.keys(JSON.parse(next)).length} schemas)`);
  }
}
