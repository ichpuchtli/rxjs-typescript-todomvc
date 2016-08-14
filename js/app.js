///<reference path="rx.all.d.ts" />
var App;
(function (App) {
    'use strict';
    const ENTER_KEY_CODE = 13;
    const STORE_KEY = 'todos-typescript-rxjs';
    const todoList = document.querySelector('.todo-list');
    const todoInput = document.querySelector('.new-todo');
    const todoCount = document.querySelector('.todo-count');
    const todoMain = document.querySelector('.main');
    const todoFooter = document.querySelector('.footer');
    const all = document.querySelector('a.all');
    const active = document.querySelector('a.active');
    const completed = document.querySelector('a.completed');
    const hide = (element) => element.style.display = 'none';
    const show = (element) => element.style.display = 'block';
    const byId = (id) => document.getElementById(id.toString());
    function parent(element) {
        return element.tagName == 'LI' ? element : parent(element.parentElement);
    }
    const clearCompletedBtn = document.querySelector('.clear-completed');
    const deleteTodoDom = (id) => byId(id).remove();
    function toArray(arraylike) {
        return Array.prototype.slice.call(arraylike);
    }
    function localTodos() {
        return toArray(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
    }
    function saveLocally(todoStore) {
        return localStorage.setItem(STORE_KEY, JSON.stringify(todoStore.filter(x => x)));
    }
    const toggleSelected = (select) => {
        all.classList.remove('selected');
        active.classList.remove('selected');
        completed.classList.remove('selected');
        select.classList.add('selected');
    };
    const addTodoDom = (todo) => {
        const li = document.createElement('li');
        li.id = todo.id.toString();
        li.innerHTML = itemTemplate(todo);
        if (todo.complete) {
            li.classList.add('completed');
        }
        todoList.appendChild(li);
        todoInput.value = '';
        show(todoFooter);
        show(todoMain);
    };
    const editTodoDom = (todo) => {
        const li = byId(todo.id);
        li.innerHTML = itemTemplate(todo);
        li.classList.remove('editing');
    };
    var edit = ({ id, title }) => (todoStore) => {
        todoStore[id].title = title;
        editTodoDom(todoStore[id]);
        return todoStore;
    };
    var itemTemplate = ({ title, complete }) => `
	<div class="view">
		<input class="toggle" type="checkbox" ${complete && 'checked'}>
		<label>${title}</label>
		<button class="destroy"></button>
	</div>
	<input class="edit" value="${title}">`;
    const routeChanges = new Rx.ReplaySubject(1);
    const routes = {
        '/': () => {
            routeChanges.onNext(todoStore => []);
            toggleSelected(all);
        },
        '/active': () => {
            routeChanges.onNext(todoStore => todoStore.filter(todo => todo.complete));
            toggleSelected(active);
        },
        '/completed': () => {
            routeChanges.onNext(todoStore => todoStore.filter(todo => todo && !todo.complete));
            toggleSelected(completed);
        }
    };
    const allEvents = Rx.Observable
        .fromEvent(todoList, 'click')
        .map(e => e.target)
        .share();
    const enterKeyPress = Rx.Observable.fromEvent(document, 'keyup')
        .filter(x => x.keyCode === ENTER_KEY_CODE)
        .share();
    const clearCompleted = Rx.Observable.fromEvent(clearCompletedBtn, 'click')
        .flatMap(e => Rx.Observable.of(...toArray(todoList.children)
        .filter(el => el.classList.contains('completed'))
        .map(el => parseInt(el.id))));
    const destroyEvents = allEvents
        .filter(el => el.className === 'destroy')
        .map(element => parseInt(parent(element).id))
        .merge(clearCompleted)
        .do(deleteTodoDom);
    const toggleEvents = allEvents.filter(e => e.className === 'toggle')
        .map((element) => {
        const li = parent(element);
        li.classList.toggle('completed');
        const id = parseInt(li.id);
        return { id };
    });
    const newTodos = enterKeyPress
        .filter(e => {
        return toArray(todoList.children).every(li => !li.classList.contains('editing'));
    })
        .map(e => ({ title: todoInput.value.trim(), complete: false }))
        .filter(todo => todo.title.length > 0);
    var add = ({ title, complete }) => (todoStore) => {
        const uid = todoStore.length;
        todoStore[uid] = { id: uid, title, complete };
        addTodoDom(todoStore[uid]);
        return todoStore;
    };
    var toggle = ({ id, complete }) => (todoStore) => {
        todoStore[id].complete = !todoStore[id].complete;
        return todoStore;
    };
    var remove = (id) => (todoStore) => {
        delete todoStore[id];
        return todoStore;
    };
    var intentToEditEvents = allEvents.filter(e => e.tagName == 'LABEL')
        .bufferWithTimeOrCount(500, 2) // dblclick implementation 
        .filter(e => e.length == 2)
        .subscribe(([e1]) => {
        const li = parent(e1);
        li.classList.add('editing');
        li.querySelector('input.edit').focus();
    });
    const blur = Rx.Observable.fromEvent(todoList, 'focusout')
        .filter(e => e.target.classList.contains('edit'));
    const edits = enterKeyPress
        .filter(e => toArray(todoList.children).some(el => el.classList.contains('editing')))
        .merge(blur)
        .map(() => {
        const li = todoList.querySelector('li.editing');
        const input = li.querySelector('input.edit');
        return { id: parseInt(li.id), title: input.value.trim() };
    });
    const updateTodoCount = (todoStore) => {
        const length = todoStore.filter(todo => todo && !todo.complete).length;
        todoCount.innerHTML = `<strong>${length}</strong> item${length > 1 ? 's' : ''} left`;
        if (length == 0) {
            hide(todoMain);
            hide(todoFooter);
        }
    };
    // merge all actions stream before scanning the action on the todo store
    const todoStoreChanges = newTodos.merge(Rx.Observable.of(...localTodos())).map(add)
        .merge(toggleEvents.map(toggle))
        .merge(destroyEvents.map(remove))
        .merge(edits.map(edit))
        .scan((todoStore, action) => action(todoStore), [])
        .do(updateTodoCount)
        .share();
    // combine route changes and todoStore changes to hide/show todos
    todoStoreChanges.combineLatest(routeChanges.asObservable(), (todoStore, filter) => filter(todoStore))
        .subscribe(todos => {
        toArray(todoList.children).forEach(show);
        toArray(todos.map(todo => byId(todo.id))).forEach(hide);
    });
    // debounce todoStoreChangeStream before persisting to localStorage
    todoStoreChanges
        .debounce(1000)
        .subscribe(saveLocally);
    var router = Router(routes);
    router.init('/');
})(App || (App = {}));
