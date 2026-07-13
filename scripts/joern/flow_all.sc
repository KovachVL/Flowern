import scala.util.matching.Regex
import io.shiftleft.codepropertygraph.generated.nodes.{AstNode, Block, Call, CfgNode, Identifier, Literal}

@main def exec(
    srcPath: String,
    outPath: String,
    language: String = "python",
    runId: String = "run",
    extraSourcePattern: String = "",
    maxFlows: Int = 500,
    maxPathsPerSink: Int = 5
) = {

  language match {
    case "python"     => importCode.python(inputPath = srcPath, projectName = runId)
    case "javascript" => importCode.jssrc(inputPath = srcPath, projectName = runId)
    case "java"       => importCode.java(inputPath = srcPath, projectName = runId)
    case other        => throw new IllegalArgumentException(s"unsupported language: $other")
  }

  val pythonSources = List(
    """request\.(form|args|values|cookies|json|get_json|files|headers|view_args)""",
    """request\.(GET|POST|COOKIES|body|META|FILES|path|path_info)""",
    """request\.(data|query_params)""",
    """request\.(remote_addr|url|full_path|base_url|host|referrer|user_agent|environ|get_data)""",
    """os\.environ""", """os\.getenv""", """input\(""", """sys\.argv"""
  )

  val jsSources = List(
    """location\.(search|hash|href|pathname)""",
    """document\.(URL|documentURI|referrer|location)""",
    """window\.name""",
    """URLSearchParams""",
    """\.data\b.*message""",
    """req\.(query|body|params|headers|cookies)""",
    """req\.(ip|hostname|originalUrl|protocol|get)""",
    """(localStorage|sessionStorage)\.""",
    """process\.env"""
  )

  val javaSources = List(
    """getParameter""", """getHeader""", """getQueryString""", """getRequestURI""",
    """getCookies""", """getInputStream""", """getReader""",
    """System\.getenv""", """System\.in""",
    """getRemoteAddr""", """getRequestURL""", """getServletPath""", """getContextPath"""
  )

  val basePatterns = language match {
    case "python"     => pythonSources
    case "javascript" => jsSources
    case "java"       => javaSources
    case _            => pythonSources
  }

  val allPatterns = if (extraSourcePattern.trim.nonEmpty) basePatterns :+ extraSourcePattern else basePatterns
  val sourcePattern: Regex = s"""(?i).*(${allPatterns.mkString("|")}).*""".r

  def source = cpg.call.code(sourcePattern.pattern.pattern())

  val sourceLinesCache = scala.collection.mutable.Map[String, Vector[String]]()
  def sourceLineFor(file: String, line: Int): String = {
    val lines = sourceLinesCache.getOrElseUpdate(
      file,
      scala.util.Try(os.read.lines(os.Path(srcPath) / os.RelPath(file)).toVector).getOrElse(Vector())
    )
    if (line >= 1 && line <= lines.size) lines(line - 1).trim else ""
  }

  def nearestStatement(n: AstNode): AstNode =
    scala.util.Try(n.astParent).toOption match {
      case Some(_: Block)   => n
      case Some(p: AstNode) => nearestStatement(p)
      case _                => n
    }

  def codeFor(n: AstNode): String = {
    val file = n.file.name.headOption.getOrElse("")
    val line = n.lineNumber.getOrElse(0)
    val stmt = nearestStatement(n)
    val stmtCode = scala.util.Try(stmt.code).getOrElse("")
    val useStmtCode = stmtCode.contains("\n") && (stmt.isInstanceOf[Literal] || stmt.isInstanceOf[Call])
    if (useStmtCode) stmtCode.split("\n").map(_.trim).filter(_.nonEmpty).mkString("\n")
    else sourceLineFor(file, line)
  }

  case class StepOut(code: String, file: String, line: Int, method: String, isContext: Boolean = false)

  def dedupSteps(steps: List[StepOut]): List[StepOut] = {
    val seen = scala.collection.mutable.Set.empty[(String, Int)]
    val buf = scala.collection.mutable.ListBuffer.empty[StepOut]
    for (step <- steps) {
      if (seen.add((step.file, step.line))) buf += step
    }
    buf.toList
  }

  def collapseSameCode(steps: List[StepOut]): List[StepOut] = {
    val seen = scala.collection.mutable.Set.empty[(String, String)]
    val buf = scala.collection.mutable.ListBuffer.empty[StepOut]
    for (step <- steps) {
      if (seen.add((step.file, step.code))) buf += step
    }
    buf.toList
  }

  def methodNameOf(n: AstNode): String = n match {
    case cfg: CfgNode => scala.util.Try(cfg.method.fullName).getOrElse("")
    case _            => ""
  }

  def enclosingCall(n: AstNode): Option[Call] = n match {
    case c: Call => Some(c)
    case _ =>
      scala.util.Try(n.astParent).toOption match {
        case Some(p: AstNode) => enclosingCall(p)
        case _                => None
      }
  }

  def contextStepsFor(call: Call): List[StepOut] = {
    val method = call.method
    val sinkLine = call.lineNumber.getOrElse(0)
    val assigns = method.ast.isCall.name("<operator>.assignment").l

    val identNames = call.argument.l.collect { case i: Identifier => i.name }.distinct

    identNames.flatMap { name =>
      assigns
        .filter(a => a.argument(1).code == name && a.lineNumber.exists(_ < sinkLine))
        .sortBy(_.lineNumber.getOrElse(0))
        .lastOption
    }.distinctBy(_.id).map { a =>
      val file = a.file.name.headOption.getOrElse("")
      val line = a.lineNumber.getOrElse(0)
      StepOut(codeFor(a), file, line, methodNameOf(a), isContext = true)
    }
  }

  val sink = cpg.call.argument

  val flowsResult = scala.util.Try {
    val flows = sink.reachableByFlows(source).l

    val withSteps = flows.flatMap { f =>
      val rawSteps = f.elements.map { elem =>
        val file = elem.file.name.headOption.getOrElse("")
        val line = elem.lineNumber.getOrElse(0)
        StepOut(codeFor(elem), file, line, methodNameOf(elem))
      }
      val steps = dedupSteps(rawSteps)
      if (steps.size < 2) None
      else {
        val last = f.elements.last
        val call = enclosingCall(last)
        val sinkFile = call.flatMap(_.file.name.headOption).getOrElse(last.file.name.headOption.getOrElse(""))
        val sinkLine = call.flatMap(_.lineNumber).getOrElse(last.lineNumber.getOrElse(0))
        val sinkMethod = call.map(methodNameOf).getOrElse(methodNameOf(last))
        val sinkId = call.map(_.id).getOrElse(last.id).toString
        Some((sinkId, sinkFile, sinkLine, sinkMethod, steps, call))
      }
    }

    val allPaths = withSteps.map(_._5)
    def isPrefixOfAnother(steps: List[StepOut]): Boolean =
      allPaths.exists(other => other.size > steps.size && other.startsWith(steps))
    val maximal = withSteps.filterNot { case (_, _, _, _, steps, _) => isPrefixOfAnother(steps) }

    val byCall = maximal.groupBy { case (_, sinkFile, sinkLine, sinkMethod, _, _) => (sinkFile, sinkLine, sinkMethod) }

    val tagged = byCall.values.map { group =>
      val (sinkId, sinkFile, sinkLine, sinkMethod, _, _) = group.head
      val contextSteps = group.flatMap(_._6).distinctBy(_.id).flatMap(contextStepsFor).distinctBy(s => (s.file, s.line))

      val dedupedBySourceSink = group
        .map(_._5)
        .distinct
        .sortBy(_.size)
        .groupBy(p => (p.head.file, p.head.line, p.last.file, p.last.line))
        .values
        .map(_.head)
        .toList

      val paths = dedupedBySourceSink.sortBy(_.size).take(maxPathsPerSink).map { steps =>
        val existingLocs = steps.map(s => (s.file, s.line)).toSet
        val extra = contextSteps.filterNot(cs => existingLocs.contains((cs.file, cs.line)))
        val withContext = if (extra.isEmpty) steps else steps.dropRight(1) ++ extra.sortBy(_.line) ++ steps.takeRight(1)
        collapseSameCode(withContext)
      }

      val obj = ujson.Obj(
        "sinkId"     -> sinkId,
        "sinkMethod" -> sinkMethod,
        "sinkFile"   -> sinkFile,
        "sinkLine"   -> sinkLine,
        "paths" -> ujson.Arr(paths.map { steps =>
          ujson.Arr(steps.map { s =>
            ujson.Obj("code" -> s.code, "file" -> s.file, "line" -> s.line, "method" -> s.method, "context" -> s.isContext)
          }: _*)
        }: _*)
      )
      (sinkFile, sinkLine, obj)
    }.toList

    tagged.sortBy { case (file, line, _) => (file, line) }.map(_._3).take(maxFlows)
  }

  flowsResult.failed.foreach(e => println(s"[!] flow computation failed: ${e.getMessage}"))
  val outFlows = flowsResult.getOrElse(List.empty[ujson.Obj])

  val methodsResult = scala.util.Try {
    val internalMethodNames: Set[String] = cpg.method.isExternal(false).fullName.toSet

    cpg.method.isExternal(false).l.map { m =>
      val callers = m.callIn.l.map { c =>
        ujson.Obj(
          "code"         -> c.code,
          "file"         -> c.file.name.headOption.getOrElse(""),
          "line"         -> c.lineNumber.getOrElse(0),
          "callerMethod" -> methodNameOf(c)
        )
      }

      val callees = m.call.l
        .filterNot(c => c.methodFullName.startsWith("<operator>") || c.name.startsWith("<"))
        .map { c =>
          val target = if (internalMethodNames.contains(c.methodFullName)) c.methodFullName else ""
          ujson.Obj(
            "code"         -> c.code,
            "file"         -> c.file.name.headOption.getOrElse(""),
            "line"         -> c.lineNumber.getOrElse(0),
            "calleeMethod" -> target
          )
        }

      ujson.Obj(
        "id"      -> m.fullName,
        "name"    -> m.name,
        "file"    -> m.filename,
        "line"    -> m.lineNumber.getOrElse(0),
        "params"  -> ujson.Arr(m.parameter.name.l.map(ujson.Str(_)): _*),
        "callers" -> ujson.Arr(callers: _*),
        "callees" -> ujson.Arr(callees: _*)
      )
    }
  }

  methodsResult.failed.foreach(e => println(s"[!] method listing failed: ${e.getMessage}"))
  val outMethods = methodsResult.getOrElse(List.empty[ujson.Obj])

  val outJson = ujson.Obj(
    "language" -> language,
    "flows"    -> ujson.Arr(outFlows: _*),
    "methods"  -> ujson.Arr(outMethods: _*)
  )
  os.write.over(os.Path(outPath, os.pwd), ujson.write(outJson, indent = 2))
  println(s"Wrote ${outFlows.size} flows and ${outMethods.size} methods to $outPath")
}
