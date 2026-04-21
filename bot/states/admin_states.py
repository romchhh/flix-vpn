from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
    
class Mailing(StatesGroup):
    content = State()
    media = State()
    description = State()
    url_buttons = State()


class LinkStates(StatesGroup):
    waiting_for_name = State()
    waiting_for_edit_name = State()


class AdminManagement(StatesGroup):
    waiting_for_admin_username = State()
    waiting_for_admin_id = State()
    waiting_for_admin_removal = State()


class StatisticsStates(StatesGroup):
    waiting_for_search_query = State()


class MenuEdit(StatesGroup):
    content = State()
    media = State()
    description = State()
    url_buttons = State()
    