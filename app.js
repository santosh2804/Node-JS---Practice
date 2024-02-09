const express = require('express')
const path = require('path')
const sqlite3 = require('sqlite3')
const {open} = require('sqlite')

const dbPath = path.join(__dirname, 'todoApplication.db')
const app = express()
app.use(express.json())

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

const hasStatusProperty = requestQuery => {
  return requestQuery.status !== undefined
}

const hasPriorityProperty = requestQuery => {
  return requestQuery.priority !== undefined
}

const hasPriorityAndStatusProperties = requestQuery => {
  return (
    requestQuery.priority !== undefined && requestQuery.status !== undefined
  )
}

app.get('/todos/', async (request, response) => {
  let {status, priority, search_q = ''} = request.query
  let getTodosListQuery = ''

  switch (true) {
    case hasPriorityAndStatusProperties(request.query):
      getTodosListQuery = `
      SELECT *
      FROM todo
      WHERE
        todo LIKE "%${search_q}%"
        AND priority = "${priority}"
        AND status = "${status}";
    `
      break

    case hasPriorityProperty(request.query):
      getTodosListQuery = `
      SELECT *
      FROM todo
      WHERE
        todo LIKE "%${search_q}%"
        AND priority = "${priority}";
    `
      break

    case hasStatusProperty(request.query):
      getTodosListQuery = `
      SELECT *
      FROM todo
      WHERE
        todo LIKE "%${search_q}%"
        AND status = "${status}";
    `
      break

    default:
      getTodosListQuery = `
      SELECT *
      FROM todo
      WHERE
        todo LIKE "%${search_q}%"
    `
  }
  let todosList = await db.all(getTodosListQuery)
  response.send(todosList)
})

app.get('/todos/:todoId/', async (request, response) => {
  let {todoId} = request.params
  let getTodoDetailsQuery = `
    SELECT *
    FROM todo
    WHERE id = ${todoId};
  `
  let todoDetails = await db.get(getTodoDetailsQuery)
  response.send(todoDetails)
})

app.post('/todos/', async (request, response) => {
  let {id, todo, priority, status} = request.body
  let addTodoQuery = `
    INSERT INTO todo(id, todo, priority, status)
    VALUES (
      ${id},
      "${todo}",
      "${priority}",
      "${status}"
      )
  `
  await db.run(addTodoQuery)
  response.send('Todo Successfully Added')
})

app.put('/todos/:todoId/', async (request, response) => {
  let {todoId} = request.params
  let {search_q = '', priority, status} = request.query
  let updateQuery = ''

  switch (true) {
    case hasPriorityProperty(request.query):
      updateQuery = `
      UPDATE todo
      SET priority = "${priority}"
      WHERE id = ${todoId};
    `
      await db.run(updateQuery)
      response.send('Priority Updated')
      break

    case hasStatusProperty(request.query):
      updateQuery = `
      UPDATE todo
      SET status = "${status}"
      WHERE id = ${todoId};
    `
      await db.run(updateQuery)
      response.send('Status Updated')
      break

    default:
      updateQuery = `
      UPDATE todo
      set todo = "${search_q}"
      WHERE id = ${todoId}
    `
      await db.run(updateQuery)
      response.send('Todo Updated')
  }
})

app.delete('/todos/:todoId/', async (request, response) => {
  let {todoId} = request.params
  let deleteTodoQuery = `
    DELETE FROM todo
    WHERE id = ${todoId}
  `
  await db.run(deleteTodoQuery)
  response.send('Todo Deleted')
})

module.exports = app
