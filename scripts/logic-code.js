(function exposeLogicCode(root, factory) {
  const dependencies = typeof module === "object" && module.exports
    ? [require("./logic-parse.js"), require("./logic-expand.js"), require("./logic-compile.js"), require("./logic-safety.js")]
    : [root.LogicParse, root.LogicExpand, root.LogicCompile, root.LogicSafety];
  const api = factory(...dependencies);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.LogicCode = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLogicCode(
  LogicParse, LogicExpand, LogicCompile, LogicSafety,
) {
  "use strict";

  const { LogicCodeError } = LogicParse;
  const {
    collectNestedEdges, compileAxialPairCandidates, compileCircuit, normalizeCircuit,
    orientSouthEast,
  } = LogicCompile;
  const { abortIfRequested, defaultYieldControl, validateGunSafety, validateGunSafetyAsync } = LogicSafety;

  function assembledPattern(command, circuit, normalized, safety, routing) {
    return Object.freeze({
      id: `logic-code-${command.presetId}`,
      name: `逻辑代码 · ${command.expression}`,
      description: `${normalized.connections.length} 条滑翔机线路真实级联；最终输出 O=${command.expected}`,
      width: normalized.width,
      height: normalized.height,
      cells: Object.freeze(normalized.cells.map((coordinate) => Object.freeze(coordinate))),
      connectionCount: normalized.connections.length,
      gateAnchors: Object.freeze(normalized.gateAnchors.map(Object.freeze)),
      gunSafety: Object.freeze({ verifiedThrough: safety.horizon }),
      routing: Object.freeze({ ...routing }),
      connections: Object.freeze(normalized.connections),
      logic: Object.freeze({
        gate: circuit.gate,
        inputs: Object.freeze([...command.inputs]),
        expected: command.expected,
        inputOrigins: Object.freeze(normalized.inputOrigins.map(Object.freeze)),
        observeGeneration: circuit.observeGeneration,
        signalCells: Object.freeze(normalized.signalCells.map(Object.freeze)),
        signalDelta: Object.freeze([...circuit.signalDelta]),
        terminalCells: Object.freeze(normalized.terminalCells.map(Object.freeze)),
      }),
    });
  }

  function routePaddingCandidates(command) {
    const gateCount = Math.max(1, command.steps?.length || 1);
    const scale = Math.max(1, Math.ceil(gateCount / 5));
    const candidates = [240, 360, 480, 720];
    if (scale > 1) candidates.push(960, 720 * scale, 1080 * scale);
    return [...new Set(candidates)].sort((left, right) => left - right);
  }

  function layoutVariantCandidates(command) {
    return (command.steps?.length || 1) > 5 ? [3, 0, 1, 2] : [0];
  }

  function branchSpacingCandidates(command) {
    return (command.steps?.length || 1) > 5 ? [20, 40, 80] : [20];
  }

  function correctRootOutputDirection(command, circuit, branchPulseSpacing) {
    const usesChannelLayout = (command.steps?.length || 1) > 5 || branchPulseSpacing > 20;
    return usesChannelLayout ? orientSouthEast(circuit) : circuit;
  }

  function axialRouting(routeSet, routeStage, testedCount, reflectorCount) {
    return {
      mode: "axial",
      routeStage,
      reflectorCount,
      directGeometryAttempts: routeSet.directGeometryAttempts,
      directCandidateCount: routeSet.direct.length,
      directCandidatesTested: routeStage === "direct" ? testedCount : routeSet.direct.length,
      reflectedCandidatesTested: routeStage === "reflected" ? testedCount : 0,
    };
  }

  const REFLECTOR_ROUTE_VARIANTS = 1;

  function largeReflectedRouting(
    layoutVariant, routePadding, branchPulseSpacing, edge, normalCandidatesTested,
    reflectedCandidatesTested,
  ) {
    return {
      layoutVariant, routePadding, branchPulseSpacing,
      routeStage: "reflected",
      reflectorCount: 2,
      reflectedEdgePath: edge.path,
      normalCandidatesTested,
      reflectedCandidatesTested,
    };
  }

  function composePattern(command, resolvePreset, resolveGateKit, resolveReflectorKit) {
    if (!command.steps || command.steps.length <= 1) return resolvePreset(command.presetId);
    if (!command.tree || typeof resolveGateKit !== "function") {
      throw new LogicCodeError("当前环境缺少真实级联门体");
    }
    if (typeof resolveReflectorKit === "function") {
      const routeSet = compileAxialPairCandidates(
        command.tree, resolveGateKit, resolveReflectorKit,
      );
      if (routeSet) {
        for (let index = 0; index < routeSet.direct.length; index += 1) {
          const axial = routeSet.direct[index];
          const normalizedAxial = normalizeCircuit(axial);
          const axialSafety = validateGunSafety(normalizedAxial);
          if (axialSafety.safe) return assembledPattern(
            command, axial, normalizedAxial, axialSafety,
            axialRouting(routeSet, "direct", index + 1, 0),
          );
        }
        for (let index = 0; index < routeSet.reflected.length; index += 1) {
          const axial = routeSet.reflected[index];
          const normalizedAxial = normalizeCircuit(axial);
          const axialSafety = validateGunSafety(normalizedAxial);
          if (axialSafety.safe) return assembledPattern(
            command, axial, normalizedAxial, axialSafety,
            axialRouting(routeSet, "reflected", index + 1, 2),
          );
        }
        if (routeSet.direct.length + routeSet.reflected.length > 0) {
          throw new LogicCodeError("同轴直连与反射线路均未通过完整安全验证");
        }
      }
    }
    let circuit;
    let normalized;
    let safety;
    let routing;
    for (const layoutVariant of layoutVariantCandidates(command)) {
      for (const branchPulseSpacing of branchSpacingCandidates(command)) {
        for (const routePadding of routePaddingCandidates(command)) {
          circuit = correctRootOutputDirection(command, compileCircuit(
            command.tree, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing,
          ), branchPulseSpacing);
          normalized = normalizeCircuit(circuit);
          safety = validateGunSafety(normalized);
          routing = { layoutVariant, routePadding, branchPulseSpacing };
          if (safety.safe) break;
        }
        if (safety?.safe) break;
      }
      if (safety?.safe) break;
    }
    if (!safety?.safe) {
      const edges = typeof resolveReflectorKit === "function"
        ? collectNestedEdges(command.tree)
        : [];
      let reflectedCandidatesTested = 0;
      const layoutVariant = layoutVariantCandidates(command)[0];
      const branchPulseSpacing = branchSpacingCandidates(command)[0];
      const routePadding = Math.max(960, routePaddingCandidates(command).at(-1));
      for (const edge of edges) {
        for (let reflectorRouteVariant = 0;
          reflectorRouteVariant < REFLECTOR_ROUTE_VARIANTS;
          reflectorRouteVariant += 1) {
          try {
            circuit = correctRootOutputDirection(command, compileCircuit(
              command.tree, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing, 0,
              {
                reflectedEdgePath: edge.path,
                reflectorRouteVariant,
                resolveReflectorKit,
              },
            ), branchPulseSpacing);
          } catch (error) {
            if (error instanceof LogicCodeError && /双反射几何候选/.test(error.message)) continue;
            throw error;
          }
          reflectedCandidatesTested += 1;
          normalized = normalizeCircuit(circuit);
          safety = validateGunSafety(normalized);
          routing = largeReflectedRouting(
            layoutVariant, routePadding, branchPulseSpacing, edge,
            layoutVariantCandidates(command).length
              * branchSpacingCandidates(command).length
              * routePaddingCandidates(command).length,
            reflectedCandidatesTested,
          );
          if (safety.safe) break;
        }
        if (safety?.safe) break;
      }
      if (safety?.safe) return assembledPattern(command, circuit, normalized, safety, routing);
      const attemptCount = layoutVariantCandidates(command).length
        * branchSpacingCandidates(command).length
        * routePaddingCandidates(command).length;
      throw new LogicCodeError(
        `已尝试 ${attemptCount} 种正常布局与 ${reflectedCandidatesTested} 种单边反射线路，仍无法找到不会撞击滑翔机枪的安全线路`,
      );
    }
    return assembledPattern(command, circuit, normalized, safety, routing);
  }

  async function composePatternAsync(
    command, resolvePreset, resolveGateKit, resolveReflectorKitOrOptions, maybeOptions = {},
  ) {
    const resolveReflectorKit = typeof resolveReflectorKitOrOptions === "function"
      ? resolveReflectorKitOrOptions
      : null;
    const options = resolveReflectorKit
      ? maybeOptions
      : (resolveReflectorKitOrOptions || {});
    abortIfRequested(options.signal);
    if (!command.steps || command.steps.length <= 1) return resolvePreset(command.presetId);
    if (!command.tree || typeof resolveGateKit !== "function") {
      throw new LogicCodeError("当前环境缺少真实级联门体");
    }
    if (resolveReflectorKit) {
      const routeSet = compileAxialPairCandidates(
        command.tree, resolveGateKit, resolveReflectorKit,
      );
      if (routeSet) {
        options.onProgress?.({
          phase: "routing", layoutMode: "axial", routeStage: "direct",
          geometryAttempts: routeSet.directGeometryAttempts,
          candidateCount: routeSet.direct.length, reflectorCount: 0,
        });
        await (options.yieldControl || defaultYieldControl)();
        abortIfRequested(options.signal);
        for (let index = 0; index < routeSet.direct.length; index += 1) {
          const axial = routeSet.direct[index];
          const normalizedAxial = normalizeCircuit(axial);
          const axialSafety = await validateGunSafetyAsync(normalizedAxial, {
            ...options,
            onProgress: (progress) => options.onProgress?.({
              ...progress, phase: "safety", layoutMode: "axial",
              routeStage: "direct", candidateIndex: index, reflectorCount: 0,
            }),
          });
          if (axialSafety.safe) return assembledPattern(
            command, axial, normalizedAxial, axialSafety,
            axialRouting(routeSet, "direct", index + 1, 0),
          );
          options.onProgress?.({
            phase: "rejected", layoutMode: "axial", routeStage: "direct",
            candidateIndex: index, reflectorCount: 0,
          });
        }
        options.onProgress?.({
          phase: "routing", layoutMode: "axial", routeStage: "reflected",
          candidateCount: routeSet.reflected.length, reflectorCount: 2,
        });
        await (options.yieldControl || defaultYieldControl)();
        abortIfRequested(options.signal);
        for (let index = 0; index < routeSet.reflected.length; index += 1) {
          const axial = routeSet.reflected[index];
          const normalizedAxial = normalizeCircuit(axial);
          const axialSafety = await validateGunSafetyAsync(normalizedAxial, {
            ...options,
            onProgress: (progress) => options.onProgress?.({
              ...progress, phase: "safety", layoutMode: "axial",
              routeStage: "reflected", candidateIndex: index, reflectorCount: 2,
            }),
          });
          if (axialSafety.safe) return assembledPattern(
            command, axial, normalizedAxial, axialSafety,
            axialRouting(routeSet, "reflected", index + 1, 2),
          );
          options.onProgress?.({
            phase: "rejected", layoutMode: "axial", routeStage: "reflected",
            candidateIndex: index, reflectorCount: 2,
          });
        }
        if (routeSet.direct.length + routeSet.reflected.length > 0) {
          throw new LogicCodeError("同轴直连与反射线路均未通过完整安全验证");
        }
      }
    }
    let circuit;
    let normalized;
    let safety;
    let routing;
    const routePaddings = routePaddingCandidates(command);
    const layoutVariants = layoutVariantCandidates(command);
    const branchSpacings = Array.isArray(options.branchSpacings)
      ? options.branchSpacings.filter((value) => Number.isInteger(value) && value >= 20 && value <= 160)
      : branchSpacingCandidates(command);
    if (branchSpacings.length === 0) throw new LogicCodeError("通道间隔候选无效");
    let attemptIndex = 0;
    for (const layoutVariant of layoutVariants) {
      for (const branchPulseSpacing of branchSpacings) {
        for (const routePadding of routePaddings) {
          abortIfRequested(options.signal);
          options.onProgress?.({
            phase: "routing", attemptIndex, routePadding, layoutVariant, branchPulseSpacing,
          });
          await (options.yieldControl || defaultYieldControl)();
          abortIfRequested(options.signal);
          circuit = correctRootOutputDirection(command, compileCircuit(
            command.tree, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing,
          ), branchPulseSpacing);
          normalized = normalizeCircuit(circuit);
          routing = { layoutVariant, routePadding, branchPulseSpacing };
          await (options.yieldControl || defaultYieldControl)();
          abortIfRequested(options.signal);
          safety = await validateGunSafetyAsync(normalized, {
            ...options,
            onProgress: (progress) => options.onProgress?.({
              ...progress, phase: "safety", attemptIndex, routePadding,
              layoutVariant, branchPulseSpacing,
            }),
          });
          if (!safety.safe) options.onProgress?.({
            phase: "rejected", attemptIndex, routePadding, layoutVariant, branchPulseSpacing,
            generation: safety.generation, groupIndex: safety.groupIndex, horizon: safety.horizon,
          });
          attemptIndex += 1;
          if (safety.safe) break;
        }
        if (safety?.safe) break;
      }
      if (safety?.safe) break;
    }
    if (!safety?.safe) {
      const edges = resolveReflectorKit ? collectNestedEdges(command.tree) : [];
      let reflectedCandidatesTested = 0;
      const layoutVariant = layoutVariants[0];
      const branchPulseSpacing = branchSpacings[0];
      const routePadding = Math.max(960, routePaddings.at(-1));
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        const edge = edges[edgeIndex];
        for (let reflectorRouteVariant = 0;
          reflectorRouteVariant < REFLECTOR_ROUTE_VARIANTS;
          reflectorRouteVariant += 1) {
          abortIfRequested(options.signal);
          options.onProgress?.({
            phase: "routing", routeStage: "reflected",
            reflectedEdgePath: edge.path, edgeIndex, edgeCount: edges.length,
            reflectorRouteVariant, reflectorCount: 2,
          });
          await (options.yieldControl || defaultYieldControl)();
          abortIfRequested(options.signal);
          try {
            circuit = correctRootOutputDirection(command, compileCircuit(
              command.tree, resolveGateKit, routePadding, layoutVariant, branchPulseSpacing, 0,
              {
                reflectedEdgePath: edge.path,
                reflectorRouteVariant,
                resolveReflectorKit,
              },
            ), branchPulseSpacing);
          } catch (error) {
            if (error instanceof LogicCodeError && /双反射几何候选/.test(error.message)) continue;
            throw error;
          }
          reflectedCandidatesTested += 1;
          normalized = normalizeCircuit(circuit);
          await (options.yieldControl || defaultYieldControl)();
          abortIfRequested(options.signal);
          safety = await validateGunSafetyAsync(normalized, {
            ...options,
            onProgress: (progress) => options.onProgress?.({
              ...progress, phase: "safety", routeStage: "reflected",
              reflectedEdgePath: edge.path, edgeIndex, edgeCount: edges.length,
              reflectorRouteVariant, reflectorCount: 2,
            }),
          });
          routing = largeReflectedRouting(
            layoutVariant, routePadding, branchPulseSpacing, edge,
            attemptIndex, reflectedCandidatesTested,
          );
          if (!safety.safe) options.onProgress?.({
            phase: "rejected", routeStage: "reflected",
            reflectedEdgePath: edge.path, edgeIndex, edgeCount: edges.length,
            reflectorRouteVariant, reflectorCount: 2,
            generation: safety.generation, groupIndex: safety.groupIndex,
            horizon: safety.horizon,
          });
          if (safety.safe) break;
        }
        if (safety?.safe) break;
      }
      if (safety?.safe) return assembledPattern(command, circuit, normalized, safety, routing);
      throw new LogicCodeError(
        `已尝试 ${attemptIndex} 种正常布局与 ${reflectedCandidatesTested} 种单边反射线路，仍无法找到不会撞击滑翔机枪的安全线路`,
      );
    }
    return assembledPattern(command, circuit, normalized, safety, routing);
  }

  return Object.freeze({
    LogicCodeError, composePattern, composePatternAsync,
    createFunctionDefinition: LogicExpand.createFunctionDefinition,
    expandFunctions: LogicExpand.expandFunctions,
    instantiateFunction: LogicExpand.instantiateFunction,
    parse: LogicParse.parse,
    parseExpanded: LogicParse.parseExpanded,
    SAFETY_SLICE_BUDGET_MS: LogicSafety.SAFETY_SLICE_BUDGET_MS,
    validateGunSafety, validateGunSafetyAsync,
  });
});
