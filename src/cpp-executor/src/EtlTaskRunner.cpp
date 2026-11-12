#include "EtlTaskRunner.h"
#include "Operators.h"
#include "util/Json.h"
#include <sstream>

namespace dc
{

    EtlTaskRunner::EtlTaskRunner(DuckDBBridge &db, PreviewCache &cache, EventSink sink)
        : db_(db), cache_(cache), sink_(std::move(sink)) {}

    void EtlTaskRunner::Cancel()
    {
        db_.MarkAborted();
        db_.Interrupt(); // R-09
    }

    void EtlTaskRunner::EmitError(const std::string &nodeId, const ExecutorError &e)
    {
        json j;
        j["nodeId"] = nodeId;
        j["error"]["code"] = e.code;
        j["error"]["message"] = e.message;
        j["error"]["retryable"] = e.retryable;
        if (e.detail)
            j["error"]["detail"] = *e.detail;
        sink_("error", j.dump());
    }

    void EtlTaskRunner::EmitNodeDone(const EtlTaskNode &node, int64_t rowCount,
                                     const std::string &schemaVersion)
    {
        json j;
        j["nodeId"] = node.nodeId;
        j["status"] = "ok";
        j["result"]["outputRecordSetKind"] = "db_table";
        j["result"]["resultVersion"] = node.resultVersion;
        j["result"]["schemaVersion"] = schemaVersion;
        j["result"]["recordSetKey"] = node.recordSetKey;
        j["result"]["rowCount"] = rowCount;
        j["result"]["outputTable"] = node.outputTable;
        sink_("nodeDone", j.dump());
    }

    void EtlTaskRunner::RunTask(const EtlTask &task)
    {
        db_.ResetAbort();
        for (const auto &node : task.nodes)
        {
            if (CheckAbort())
            {
                json j;
                j["taskId"] = task.taskId;
                j["status"] = "cancelled";
                sink_("taskDone", j.dump());
                return;
            }
            {
                json j;
                j["taskId"] = task.taskId;
                j["nodeId"] = node.nodeId;
                sink_("nodeStart", j.dump());
            }
            try
            {
                // hint 校验（R-04）：M1 无 registry，直接信任 hint，但校验枚举合法
                if (node.executeMode == ExecuteMode::kStream)
                    RunStreamNode(node);
                else
                    RunBarrierNode(node);
            }
            catch (const std::exception &e)
            {
                EmitError(node.nodeId, MakeError("SQL_EXEC_FAILED", e.what(), false));
                json j;
                j["taskId"] = task.taskId;
                j["status"] = "error";
                sink_("taskDone", j.dump());
                return;
            }
        }
        json j;
        j["taskId"] = task.taskId;
        j["status"] = "ok";
        sink_("taskDone", j.dump());
    }

    void EtlTaskRunner::RunStreamNode(const EtlTaskNode &node)
    {
        if (node.resultVersion.empty())
            throw std::runtime_error("resultVersion missing for node " + node.nodeId);

        ops::OpResult r;
        if (node.nodeType == "CsvReader")
            r = ops::RunCsvReader(db_, node);
        else if (node.nodeType == "Filter")
            r = ops::RunFilter(db_, node);
        else
            throw std::runtime_error("unsupported stream operator: " + node.nodeType);

        // 写预览元信息（真实行流在 M2 用 ArrowArrayStream；M1 只记行数）
        json meta = {
            {"nodeType", node.nodeType},
            {"outputTable", node.outputTable},
            {"rowCount", r.rowCount},
        };
        cache_.Write(node.recordSetKey, node.resultVersion, 0, meta.dump());

        EmitNodeDone(node, r.rowCount, r.schemaVersion);
    }

    void EtlTaskRunner::RunBarrierNode(const EtlTaskNode &node)
    {
        throw std::runtime_error("M1 未实现 barrier 算子: " + node.nodeType);
    }

} // namespace dc