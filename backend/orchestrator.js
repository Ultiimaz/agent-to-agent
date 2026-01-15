import { Agent } from './agent.js';
import { eventBus } from './messageQueue.js';

export class OrchestratorAgent extends Agent {
  constructor() {
    super({
      id: 'orchestrator',
      name: 'Orchestrator',
      role: 'coordinator',
      systemPrompt: `You are an orchestrator agent responsible for coordinating multiple specialized agents to accomplish complex tasks.

Your responsibilities:
1. Break down user requests into subtasks
2. Determine which specialized agent should handle each subtask
3. Coordinate the execution of subtasks in the correct order
4. Synthesize results from multiple agents into a final response
5. Ask for clarification when requirements are ambiguous

Available specialized agents:
- CodeAgent: For writing, reviewing, and debugging code
- DesignAgent: For creating UI/UX designs and frontend implementations
- ResearchAgent: For gathering information and analyzing data

You must respond with a JSON object containing:
{
  "analysis": "Your analysis of the request",
  "plan": [
    {
      "agentId": "agent_id",
      "task": "task description",
      "dependencies": ["previous_task_ids"]
    }
  ],
  "clarifications": ["questions if needed"]
}`,
      model: 'openai/gpt-4-turbo-preview'
    });

    this.availableAgents = new Map();
    this.taskResults = new Map();
    this.taskStore = null;
  }

  setTaskStore(taskStore) {
    this.taskStore = taskStore;
  }

  registerAgent(agent) {
    this.availableAgents.set(agent.id, agent);
    eventBus.publish({
      type: 'orchestrator_agent_registered',
      agentId: agent.id,
      agentName: agent.name
    });
  }

  // Async version that updates task store instead of blocking
  async orchestrateAsync(taskId, userRequest) {
    const task = this.taskStore?.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    eventBus.publish({
      type: 'orchestrator_started',
      taskId,
      request: userRequest
    });

    try {
      const planningResponse = await this.execute({
        description: userRequest,
        context: {
          availableAgents: Array.from(this.availableAgents.values()).map(a => ({
            id: a.id,
            name: a.name,
            role: a.role
          }))
        }
      });

      if (!planningResponse.success) {
        throw new Error('Planning failed: ' + planningResponse.error);
      }

      let plan;
      try {
        const jsonMatch = planningResponse.result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[0]);
        } else {
          plan = { plan: [], clarifications: [], analysis: planningResponse.result };
        }
      } catch (e) {
        plan = { plan: [], clarifications: [], analysis: planningResponse.result };
      }

      // Handle clarifications asynchronously
      if (plan.clarifications && plan.clarifications.length > 0) {
        task.status = 'waiting_for_clarification';
        task.clarification = {
          questions: plan.clarifications,
          context: { originalRequest: userRequest }
        };

        eventBus.publish({
          type: 'orchestrator_needs_clarification',
          taskId,
          clarifications: plan.clarifications
        });

        // Wait for answer via event bus
        const answer = await this.waitForClarificationAnswer(taskId);

        // Continue with clarified request
        task.status = 'running';
        task.clarification = null;
        return await this.orchestrateAsync(taskId, `${userRequest}\n\nClarifications: ${answer}`);
      }

      eventBus.publish({
        type: 'orchestrator_plan_created',
        taskId,
        plan: plan.plan || [],
        analysis: plan.analysis
      });

      const results = [];

      if (plan.plan && plan.plan.length > 0) {
        for (const planTask of plan.plan) {
          const agent = this.availableAgents.get(planTask.agentId);

          if (!agent) {
            eventBus.publish({
              type: 'orchestrator_error',
              taskId,
              error: `Agent ${planTask.agentId} not found`
            });
            continue;
          }

          const dependencyResults = {};
          if (planTask.dependencies) {
            for (const depId of planTask.dependencies) {
              if (this.taskResults.has(depId)) {
                dependencyResults[depId] = this.taskResults.get(depId);
              }
            }
          }

          eventBus.publish({
            type: 'orchestrator_delegating',
            taskId,
            agentId: planTask.agentId,
            task: planTask.task
          });

          const result = await agent.execute(planTask.task, {
            dependencies: dependencyResults,
            originalRequest: userRequest
          });

          this.taskResults.set(planTask.agentId + '_' + Date.now(), result);
          results.push(result);
        }
      }

      const finalResult = await this.synthesizeResults(userRequest, results, plan.analysis);

      // Update task with result
      task.status = 'completed';
      task.result = finalResult;

      eventBus.publish({
        type: 'orchestrator_completed',
        taskId,
        result: finalResult
      });

      return finalResult;

    } catch (error) {
      task.status = 'error';
      task.error = error.message;

      eventBus.publish({
        type: 'orchestrator_error',
        taskId,
        error: error.message
      });

      throw error;
    }
  }

  // Wait for clarification answer via event bus
  waitForClarificationAnswer(taskId) {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.type === 'task_clarification_answer' && event.taskId === taskId) {
          eventBus.off('event', handler);
          resolve(event.answer);
        }
      };
      eventBus.on('event', handler);
    });
  }

  async orchestrate(userRequest) {
    eventBus.publish({
      type: 'orchestrator_started',
      request: userRequest
    });

    try {
      const planningResponse = await this.execute({
        description: userRequest,
        context: {
          availableAgents: Array.from(this.availableAgents.values()).map(a => ({
            id: a.id,
            name: a.name,
            role: a.role
          }))
        }
      });

      if (!planningResponse.success) {
        throw new Error('Planning failed: ' + planningResponse.error);
      }

      let plan;
      try {
        const jsonMatch = planningResponse.result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          plan = JSON.parse(jsonMatch[0]);
        } else {
          plan = { plan: [], clarifications: [], analysis: planningResponse.result };
        }
      } catch (e) {
        plan = { plan: [], clarifications: [], analysis: planningResponse.result };
      }

      if (plan.clarifications && plan.clarifications.length > 0) {
        eventBus.publish({
          type: 'orchestrator_needs_clarification',
          clarifications: plan.clarifications
        });

        const answer = await this.askClarification(
          plan.clarifications.join('\n'),
          { originalRequest: userRequest }
        );

        return await this.orchestrate(`${userRequest}\n\nClarifications: ${answer}`);
      }

      eventBus.publish({
        type: 'orchestrator_plan_created',
        plan: plan.plan || [],
        analysis: plan.analysis
      });

      const results = [];

      if (plan.plan && plan.plan.length > 0) {
        for (const task of plan.plan) {
          const agent = this.availableAgents.get(task.agentId);

          if (!agent) {
            eventBus.publish({
              type: 'orchestrator_error',
              error: `Agent ${task.agentId} not found`
            });
            continue;
          }

          const dependencyResults = {};
          if (task.dependencies) {
            for (const depId of task.dependencies) {
              if (this.taskResults.has(depId)) {
                dependencyResults[depId] = this.taskResults.get(depId);
              }
            }
          }

          eventBus.publish({
            type: 'orchestrator_delegating',
            agentId: task.agentId,
            task: task.task
          });

          const result = await agent.execute(task.task, {
            dependencies: dependencyResults,
            originalRequest: userRequest
          });

          this.taskResults.set(task.agentId + '_' + Date.now(), result);
          results.push(result);
        }
      }

      const finalResult = await this.synthesizeResults(userRequest, results, plan.analysis);

      eventBus.publish({
        type: 'orchestrator_completed',
        result: finalResult
      });

      return finalResult;

    } catch (error) {
      eventBus.publish({
        type: 'orchestrator_error',
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  async synthesizeResults(originalRequest, results, analysis) {
    const synthesisPrompt = `
Original Request: ${originalRequest}

Analysis: ${analysis}

Agent Results:
${results.map((r, i) => `
Agent ${i + 1} (${r.agentName}):
${r.success ? r.result : 'Error: ' + r.error}
`).join('\n')}

Please synthesize these results into a coherent final response for the user.
`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: 'You are synthesizing results from multiple agents. Provide a clear, comprehensive response.'
        },
        {
          role: 'user',
          content: synthesisPrompt
        }
      ]
    });

    return {
      success: true,
      result: response.choices[0].message.content,
      agentResults: results,
      analysis
    };
  }
}
